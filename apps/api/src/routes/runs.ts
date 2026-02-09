import type { FastifyInstance } from "fastify";
import type { ApiResponse, RunLog, RunDetail, RunStep, FileChange } from "@elruso/types";
import { getDb, tryGetDb } from "../db.js";

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  // TODO: agregar auth middleware (token) en Fase 6

  // GET /runs — lista de ejecuciones recientes
  app.get("/runs", async (request): Promise<ApiResponse<RunLog[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("run_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) {
      request.log.error(error, "Error fetching runs");
      return { ok: false, error: error.message };
    }

    return { ok: true, data: data as RunLog[] };
  });

  // GET /runs/:id — detalle de una ejecucion con steps y file_changes
  app.get<{ Params: { id: string } }>(
    "/runs/:id",
    async (request): Promise<ApiResponse<RunDetail>> => {
      const { id } = request.params;
      const db = getDb();

      // Buscar run
      const { data: run, error: runError } = await db
        .from("run_logs")
        .select("*")
        .eq("id", id)
        .single();

      if (runError || !run) {
        return { ok: false, error: runError?.message ?? "Run no encontrado" };
      }

      // Buscar steps y file_changes en paralelo
      const [stepsResult, filesResult] = await Promise.all([
        db
          .from("run_steps")
          .select("*")
          .eq("run_id", id)
          .order("started_at", { ascending: true }),
        db
          .from("file_changes")
          .select("*")
          .eq("run_id", id)
          .order("path", { ascending: true }),
      ]);

      const detail: RunDetail = {
        ...(run as RunLog),
        steps: (stepsResult.data as RunStep[]) ?? [],
        file_changes: (filesResult.data as FileChange[]) ?? [],
      };

      return { ok: true, data: detail };
    }
  );

  // POST /runs — crear un run nuevo
  app.post<{
    Body: { task_id: string; branch?: string; commit_hash?: string };
  }>("/runs", async (request): Promise<ApiResponse<RunLog>> => {
    const { task_id, branch, commit_hash } = request.body as {
      task_id: string;
      branch?: string;
      commit_hash?: string;
    };

    if (!task_id) {
      return { ok: false, error: "task_id es requerido" };
    }

    const db = tryGetDb();
    if (!db) {
      return { ok: false, error: "DB no disponible. Se requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY" };
    }

    const { data, error } = await db
      .from("run_logs")
      .insert({
        task_id,
        status: "running",
        branch: branch ?? null,
        commit_hash: commit_hash ?? null,
      })
      .select()
      .single();

    if (error) {
      request.log.error(error, "Error creando run");
      return { ok: false, error: error.message };
    }

    return { ok: true, data: data as RunLog };
  });

  // POST /runs/:id/steps — agregar step a un run
  app.post<{
    Params: { id: string };
    Body: { step_name: string; cmd?: string; exit_code?: number; output_excerpt?: string };
  }>("/runs/:id/steps", async (request): Promise<ApiResponse<RunStep>> => {
    const { id } = request.params;
    const { step_name, cmd, exit_code, output_excerpt } = request.body as {
      step_name: string;
      cmd?: string;
      exit_code?: number;
      output_excerpt?: string;
    };

    if (!step_name) {
      return { ok: false, error: "step_name es requerido" };
    }

    const db = tryGetDb();
    if (!db) {
      return { ok: false, error: "DB no disponible" };
    }

    const finished_at = exit_code !== undefined ? new Date().toISOString() : null;

    const { data, error } = await db
      .from("run_steps")
      .insert({
        run_id: id,
        step_name,
        cmd: cmd ?? null,
        exit_code: exit_code ?? null,
        output_excerpt: output_excerpt ?? null,
        finished_at,
      })
      .select()
      .single();

    if (error) {
      request.log.error(error, "Error creando step");
      return { ok: false, error: error.message };
    }

    return { ok: true, data: data as RunStep };
  });

  // PATCH /runs/:id — finalizar un run (status, summary, file_changes)
  app.patch<{
    Params: { id: string };
    Body: { status: string; summary?: string; file_changes?: Array<{ path: string; change_type: string }> };
  }>("/runs/:id", async (request): Promise<ApiResponse<RunLog>> => {
    const { id } = request.params;
    const { status, summary, file_changes } = request.body as {
      status: string;
      summary?: string;
      file_changes?: Array<{ path: string; change_type: string }>;
    };

    const validStatuses = ["running", "done", "failed", "blocked"];
    if (!validStatuses.includes(status)) {
      return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
    }

    const db = tryGetDb();
    if (!db) {
      return { ok: false, error: "DB no disponible" };
    }

    const updates: Record<string, unknown> = { status };
    if (summary !== undefined) updates.summary = summary;
    if (status === "done" || status === "failed") {
      updates.finished_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("run_logs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      request.log.error(error, "Error actualizando run");
      return { ok: false, error: error.message };
    }

    // Insertar file_changes si se enviaron
    if (file_changes && file_changes.length > 0) {
      const rows = file_changes.map((fc) => ({
        run_id: id,
        path: fc.path,
        change_type: fc.change_type,
      }));
      await db.from("file_changes").insert(rows);
    }

    return { ok: true, data: data as RunLog };
  });
}
