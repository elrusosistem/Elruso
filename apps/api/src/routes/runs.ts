import type { FastifyInstance } from "fastify";
import type { ApiResponse, RunLog, RunDetail, RunStep, FileChange } from "@elruso/types";
import { getDb } from "../db.js";

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

  // GET /runs/:id — detalle de una ejecución con steps y file_changes
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
}
