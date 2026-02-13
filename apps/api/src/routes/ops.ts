import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { getDb } from "../db.js";
import { saveRequestValues, hasRequestValues, generateEnvRuntime, validateProvider, execScript } from "../vault.js";

// ─── Types locales ──────────────────────────────────────────────────
interface Directive {
  id: string;
  created_at: string;
  source: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  title: string;
  body: string;
  acceptance_criteria: string[];
  tasks_to_create: unknown[];
  applied_at: string | null;
  applied_by: string | null;
  rejection_reason: string | null;
}

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  branch: string;
  depends_on: string[];
  blocked_by: string[];
  directive_id?: string;
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  // TODO: agregar auth middleware en Fase 6

  // ─── REQUESTS ────────────────────────────────────────────────────

  app.get("/ops/requests", async (): Promise<ApiResponse<OpsRequest[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("ops_requests")
      .select("*")
      .order("id");
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as OpsRequest[] };
  });

  app.post<{ Body: OpsRequest }>(
    "/ops/requests",
    async (request): Promise<ApiResponse<OpsRequest>> => {
      const body = request.body as OpsRequest;

      if (!body.id || !body.service || !body.purpose) {
        return { ok: false, error: "id, service y purpose son requeridos" };
      }

      const entry: OpsRequest = {
        id: body.id,
        service: body.service,
        type: body.type || "credentials",
        scopes: body.scopes || [],
        purpose: body.purpose,
        where_to_set: body.where_to_set || "",
        validation_cmd: body.validation_cmd || "",
        status: body.status || "WAITING",
      };

      const db = getDb();
      const { data, error } = await db
        .from("ops_requests")
        .upsert(entry, { onConflict: "id" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as OpsRequest };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string; provided_at?: string } }>(
    "/ops/requests/:id",
    async (request): Promise<ApiResponse<OpsRequest>> => {
      const { id } = request.params;
      const { status, provided_at } = request.body as { status: string; provided_at?: string };

      const validStatuses = ["WAITING", "PROVIDED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = getDb();
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (provided_at) updates.provided_at = provided_at;
      if (status === "PROVIDED" && !provided_at) updates.provided_at = new Date().toISOString();

      const { data, error } = await db
        .from("ops_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as OpsRequest };
    }
  );

  // ─── VAULT (secrets locales) ─────────────────────────────────────

  app.post<{ Params: { id: string }; Body: { values: Record<string, string> } }>(
    "/ops/requests/:id/value",
    async (request): Promise<ApiResponse<{ saved: boolean; env_runtime: string }>> => {
      const { id } = request.params;
      const { values } = request.body as { values: Record<string, string> };

      if (!values || Object.keys(values).length === 0) {
        return { ok: false, error: "Se requiere al menos un valor" };
      }

      saveRequestValues(id, values);

      // Marcar request como PROVIDED
      const db = getDb();
      await db
        .from("ops_requests")
        .update({ status: "PROVIDED", provided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);

      const envPath = generateEnvRuntime();
      return { ok: true, data: { saved: true, env_runtime: envPath } };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/ops/requests/:id/value/status",
    async (request): Promise<ApiResponse<{ has_value: boolean }>> => {
      const { id } = request.params;
      return { ok: true, data: { has_value: hasRequestValues(id) } };
    }
  );

  // ─── VALIDATE ──────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/ops/requests/:id/validate",
    async (request): Promise<ApiResponse<{ ok: boolean; message: string }>> => {
      const { id } = request.params;
      const result = await validateProvider(id);
      return { ok: true, data: result };
    }
  );

  // ─── ACTIONS (ejecutar scripts desde panel) ────────────────────

  type ActionResult = { ok: boolean; output: string; exitCode: number };

  const ACTION_SCRIPTS: Record<string, string> = {
    migrate: "db_migrate.sh",
    "sync-push": "ops_sync_push.sh",
    "sync-pull": "ops_sync_pull.sh",
    "deploy-render": "deploy_staging_api.sh",
    "deploy-vercel": "deploy_staging_web.sh",
  };

  app.post<{ Params: { action: string } }>(
    "/ops/actions/:action",
    async (request): Promise<ApiResponse<ActionResult>> => {
      const { action } = request.params;
      const scriptName = ACTION_SCRIPTS[action];
      if (!scriptName) {
        return { ok: false, error: `Accion desconocida: ${action}. Validas: ${Object.keys(ACTION_SCRIPTS).join(", ")}` };
      }
      const result = await execScript(scriptName);
      return { ok: true, data: result };
    }
  );

  // ─── DIRECTIVES ──────────────────────────────────────────────────

  app.get("/ops/directives", async (): Promise<ApiResponse<Directive[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("ops_directives")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Directive[] };
  });

  app.get<{ Params: { id: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const { id } = request.params;
      const db = getDb();
      const { data, error } = await db
        .from("ops_directives")
        .select("*")
        .eq("id", id)
        .single();
      if (error) return { ok: false, error: `Directiva ${id} no encontrada` };
      return { ok: true, data: data as Directive };
    }
  );

  app.post<{ Body: Directive }>(
    "/ops/directives",
    async (request): Promise<ApiResponse<Directive>> => {
      const body = request.body as Partial<Directive>;

      if (!body.id || !body.title) {
        return { ok: false, error: "id y title son requeridos" };
      }

      const entry = {
        id: body.id,
        source: body.source || "gpt",
        status: body.status || "PENDING",
        title: body.title,
        body: body.body || "",
        acceptance_criteria: body.acceptance_criteria || [],
        tasks_to_create: body.tasks_to_create || [],
        created_at: body.created_at || new Date().toISOString(),
      };

      const db = getDb();
      const { data, error } = await db
        .from("ops_directives")
        .upsert(entry, { onConflict: "id" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as Directive };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string; rejection_reason?: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const { id } = request.params;
      const { status, rejection_reason } = request.body as {
        status: string;
        rejection_reason?: string;
      };

      const validStatuses = ["PENDING", "APPLIED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = getDb();
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === "APPLIED") {
        updates.applied_at = new Date().toISOString();
        updates.applied_by = "human";
      }
      if (status === "REJECTED" && rejection_reason) {
        updates.rejection_reason = rejection_reason;
      }

      const { data, error } = await db
        .from("ops_directives")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as Directive };
    }
  );

  // ─── TASKS ───────────────────────────────────────────────────────

  app.get("/ops/tasks", async (request): Promise<ApiResponse<TaskEntry[]>> => {
    const url = new URL(request.url, "http://localhost");
    const statusFilter = url.searchParams.get("status");
    const phaseFilter = url.searchParams.get("phase");

    const db = getDb();
    let query = db.from("ops_tasks").select("*").order("id");
    if (statusFilter) query = query.eq("status", statusFilter);
    if (phaseFilter) query = query.eq("phase", Number(phaseFilter));

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as TaskEntry[] };
  });

  app.post<{ Body: TaskEntry }>(
    "/ops/tasks",
    async (request): Promise<ApiResponse<TaskEntry>> => {
      const body = request.body as Partial<TaskEntry>;

      if (!body.id || !body.title) {
        return { ok: false, error: "id y title son requeridos" };
      }

      const entry = {
        id: body.id,
        phase: body.phase ?? 0,
        title: body.title,
        status: body.status || "ready",
        branch: body.branch || `task/${body.id}`,
        depends_on: body.depends_on || [],
        blocked_by: body.blocked_by || [],
        directive_id: body.directive_id || null,
      };

      const db = getDb();
      const { data, error } = await db
        .from("ops_tasks")
        .upsert(entry, { onConflict: "id" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as TaskEntry };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    "/ops/tasks/:id",
    async (request): Promise<ApiResponse<TaskEntry>> => {
      const { id } = request.params;
      const { status } = request.body as { status: string };

      const validStatuses = ["ready", "running", "done", "failed", "blocked"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = getDb();
      const { data, error } = await db
        .from("ops_tasks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as TaskEntry };
    }
  );
}
