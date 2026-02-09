import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tryGetDb } from "../db.js";
import { saveRequestValues, hasRequestValues, generateEnvRuntime, validateProvider, execScript } from "../vault.js";

// ─── File-backed helpers (fallback sin DB) ──────────────────────────
const OPS_DIR = resolve(import.meta.dirname, "../../../../ops");

function readJson<T>(filename: string): T {
  const filepath = resolve(OPS_DIR, filename);
  const content = readFileSync(filepath, "utf-8");
  return JSON.parse(content) as T;
}

function writeJson(filename: string, data: unknown): void {
  const filepath = resolve(OPS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

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
    const db = tryGetDb();
    if (db) {
      const { data, error } = await db
        .from("ops_requests")
        .select("*")
        .order("id");
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as OpsRequest[] };
    }
    return { ok: true, data: readJson<OpsRequest[]>("REQUESTS.json") };
  });

  app.patch<{ Params: { id: string }; Body: { status: string; provided_at?: string } }>(
    "/ops/requests/:id",
    async (request): Promise<ApiResponse<OpsRequest>> => {
      const { id } = request.params;
      const { status, provided_at } = request.body as { status: string; provided_at?: string };

      const validStatuses = ["WAITING", "PROVIDED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = tryGetDb();
      if (db) {
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

      // Fallback file-backed
      const all = readJson<OpsRequest[]>("REQUESTS.json");
      const idx = all.findIndex((r) => r.id === id);
      if (idx === -1) return { ok: false, error: `Request ${id} no encontrado` };

      all[idx].status = status as OpsRequest["status"];
      if (provided_at) all[idx].provided_at = provided_at;
      if (status === "PROVIDED" && !all[idx].provided_at) {
        all[idx].provided_at = new Date().toISOString();
      }
      writeJson("REQUESTS.json", all);
      return { ok: true, data: all[idx] };
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
      const db = tryGetDb();
      if (db) {
        await db
          .from("ops_requests")
          .update({ status: "PROVIDED", provided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);
      } else {
        const all = readJson<OpsRequest[]>("REQUESTS.json");
        const idx = all.findIndex((r) => r.id === id);
        if (idx !== -1) {
          all[idx].status = "PROVIDED";
          all[idx].provided_at = new Date().toISOString();
          writeJson("REQUESTS.json", all);
        }
      }

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
    seed: "seed_ops_to_db.sh",
    "deploy-render": "deploy_staging_api.sh",
    "deploy-vercel": "deploy_staging_web.sh",
  };

  app.post<{ Params: { action: string } }>(
    "/ops/actions/:action",
    async (request): Promise<ApiResponse<ActionResult>> => {
      const { action } = request.params;
      const scriptName = ACTION_SCRIPTS[action];
      if (!scriptName) {
        return { ok: false, error: `Acción desconocida: ${action}. Válidas: ${Object.keys(ACTION_SCRIPTS).join(", ")}` };
      }
      const result = await execScript(scriptName);
      return { ok: true, data: result };
    }
  );

  // ─── DIRECTIVES ──────────────────────────────────────────────────

  app.get("/ops/directives", async (): Promise<ApiResponse<Directive[]>> => {
    const db = tryGetDb();
    if (db) {
      const { data, error } = await db
        .from("ops_directives")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as Directive[] };
    }
    return { ok: true, data: readJson<Directive[]>("DIRECTIVES_INBOX.json") };
  });

  app.get<{ Params: { id: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const { id } = request.params;
      const db = tryGetDb();
      if (db) {
        const { data, error } = await db
          .from("ops_directives")
          .select("*")
          .eq("id", id)
          .single();
        if (error) return { ok: false, error: `Directiva ${id} no encontrada` };
        return { ok: true, data: data as Directive };
      }

      const all = readJson<Directive[]>("DIRECTIVES_INBOX.json");
      const directive = all.find((d) => d.id === id);
      if (!directive) return { ok: false, error: `Directiva ${id} no encontrada` };
      return { ok: true, data: directive };
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
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = tryGetDb();
      if (db) {
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

      // Fallback file-backed
      const all = readJson<Directive[]>("DIRECTIVES_INBOX.json");
      const idx = all.findIndex((d) => d.id === id);
      if (idx === -1) return { ok: false, error: `Directiva ${id} no encontrada` };

      all[idx].status = status as Directive["status"];
      if (status === "APPLIED") {
        all[idx].applied_at = new Date().toISOString();
        all[idx].applied_by = "human";
      }
      if (status === "REJECTED" && rejection_reason) {
        all[idx].rejection_reason = rejection_reason;
      }
      writeJson("DIRECTIVES_INBOX.json", all);
      return { ok: true, data: all[idx] };
    }
  );

  // ─── TASKS ───────────────────────────────────────────────────────

  app.get("/ops/tasks", async (request): Promise<ApiResponse<TaskEntry[]>> => {
    const url = new URL(request.url, "http://localhost");
    const statusFilter = url.searchParams.get("status");
    const phaseFilter = url.searchParams.get("phase");

    const db = tryGetDb();
    if (db) {
      let query = db.from("ops_tasks").select("*").order("id");
      if (statusFilter) query = query.eq("status", statusFilter);
      if (phaseFilter) query = query.eq("phase", Number(phaseFilter));

      const { data, error } = await query;
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as TaskEntry[] };
    }

    // Fallback file-backed
    let filtered = readJson<TaskEntry[]>("TASKS.json");
    if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
    if (phaseFilter) filtered = filtered.filter((t) => t.phase === Number(phaseFilter));
    return { ok: true, data: filtered };
  });

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    "/ops/tasks/:id",
    async (request): Promise<ApiResponse<TaskEntry>> => {
      const { id } = request.params;
      const { status } = request.body as { status: string };

      const validStatuses = ["ready", "running", "done", "failed", "blocked"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const db = tryGetDb();
      if (db) {
        const { data, error } = await db
          .from("ops_tasks")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: data as TaskEntry };
      }

      // Fallback file-backed
      const all = readJson<TaskEntry[]>("TASKS.json");
      const idx = all.findIndex((t) => t.id === id);
      if (idx === -1) return { ok: false, error: `Task ${id} no encontrada` };

      all[idx].status = status;
      writeJson("TASKS.json", all);
      return { ok: true, data: all[idx] };
    }
  );
}
