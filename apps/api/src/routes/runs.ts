import type { FastifyInstance } from "fastify";
import type { ApiResponse, RunLog, RunDetail, RunStep, FileChange } from "@elruso/types";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { redact, containsSecrets } from "../redact.js";
import { getAllValues } from "../vault.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");

function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  run_id?: string | null;
}): void {
  const db = getDb();
  db.from("decisions_log").insert({
    source: opts.source,
    decision_key: opts.decision_key,
    decision_value: opts.decision_value,
    context: opts.context ?? null,
    run_id: opts.run_id ?? null,
  }).then(() => {}, () => {});
}

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

    const db = getDb();

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

    const db = getDb();

    const finished_at = exit_code !== undefined ? new Date().toISOString() : null;

    const { data, error } = await db
      .from("run_steps")
      .insert({
        run_id: id,
        step_name,
        cmd: cmd ?? null,
        exit_code: exit_code ?? null,
        output_excerpt: output_excerpt ? redact(output_excerpt, getAllValues()) : null,
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
    Body: { status: string; summary?: string; file_changes?: Array<{ path: string; change_type: string; diffstat?: string }> };
  }>("/runs/:id", async (request): Promise<ApiResponse<RunLog>> => {
    const { id } = request.params;
    const { status, summary, file_changes } = request.body as {
      status: string;
      summary?: string;
      file_changes?: Array<{ path: string; change_type: string; diffstat?: string }>;
    };

    const validStatuses = ["running", "done", "failed", "blocked"];
    if (!validStatuses.includes(status)) {
      return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
    }

    const db = getDb();

    const updates: Record<string, unknown> = { status };
    if (summary !== undefined) updates.summary = redact(summary, getAllValues());
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
        diffstat: fc.diffstat ?? null,
      }));
      await db.from("file_changes").insert(rows);
    }

    // Decision log: run_completed / run_failed
    if (status === "done" || status === "failed") {
      logDecision({
        source: "runner",
        decision_key: status === "done" ? "run_completed" : "run_failed",
        decision_value: {
          run_id: id,
          task_id: (data as RunLog).task_id,
          file_changes_count: file_changes?.length ?? 0,
        },
        run_id: id,
      });
    }

    return { ok: true, data: data as RunLog };
  });

  // ─── ARTIFACTS ──────────────────────────────────────────────────────

  // POST /runs/:id/artifacts — Adjuntar evidencia forense (diffstat + patch redacted)
  app.post<{
    Params: { id: string };
    Body: {
      diffstat: string;
      patch_redacted: string;
      before_sha?: string;
      after_sha?: string;
    };
  }>("/runs/:id/artifacts", async (request): Promise<ApiResponse<{ saved: boolean; artifact_path: string }>> => {
    const { id } = request.params;
    const body = request.body as {
      diffstat: string;
      patch_redacted: string;
      before_sha?: string;
      after_sha?: string;
    };

    const db = getDb();

    // 1. Verify run exists
    const { data: run, error: runErr } = await db
      .from("run_logs")
      .select("id, task_id")
      .eq("id", id)
      .single();

    if (runErr || !run) {
      return { ok: false, error: "run_not_found" };
    }

    // 2. Defense in depth: re-redact patch
    const secrets = getAllValues();
    const safePatched = redact(body.patch_redacted || "", secrets);
    const safeDiffstat = redact(body.diffstat || "", secrets);

    // 3. Hard fail if secrets remain after redaction
    if (containsSecrets(safePatched)) {
      request.log.error("SECURITY: secrets detected in patch after double-redaction");
      return { ok: false, error: "patch_contains_secrets_after_redaction" };
    }

    // 4. Save to filesystem
    const artifactDir = join(ROOT, "reports", "runs", id);
    try {
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "patch_redacted.diff"), safePatched, "utf-8");
      writeFileSync(join(artifactDir, "diffstat.txt"), safeDiffstat, "utf-8");
    } catch (err) {
      request.log.error(err, "Error saving artifact files");
      // Not fatal — continue with DB operations
    }

    const artifactPath = `reports/runs/${id}/patch_redacted.diff`;

    // 5. Update run_logs.artifact_path
    await db.from("run_logs").update({ artifact_path: artifactPath }).eq("id", id);

    // 6. Insert file_change with diffstat
    await db.from("file_changes").insert({
      run_id: id,
      path: "__GIT_DIFF__",
      change_type: "modified",
      diffstat: safeDiffstat || "0 files changed",
    });

    // 7. Decision log
    logDecision({
      source: "runner",
      decision_key: "run_patch_saved",
      decision_value: {
        run_id: id,
        artifact_path: artifactPath,
        patch_lines: safePatched.split("\n").length,
        diffstat_summary: safeDiffstat.split("\n").slice(-1)[0] || "no changes",
      },
      context: {
        before_sha: body.before_sha || null,
        after_sha: body.after_sha || null,
      },
      run_id: id,
    });

    return { ok: true, data: { saved: true, artifact_path: artifactPath } };
  });

  // GET /runs/:id/artifacts/patch — Leer patch redacted
  app.get<{ Params: { id: string } }>(
    "/runs/:id/artifacts/patch",
    async (request, reply): Promise<ApiResponse<{ patch: string }> | void> => {
      const { id } = request.params;
      const patchPath = join(ROOT, "reports", "runs", id, "patch_redacted.diff");

      if (!existsSync(patchPath)) {
        return { ok: false, error: "patch_not_found" };
      }

      const content = readFileSync(patchPath, "utf-8");
      return { ok: true, data: { patch: content } };
    }
  );

  // GET /runs/:id/artifacts/diffstat — Leer diffstat
  app.get<{ Params: { id: string } }>(
    "/runs/:id/artifacts/diffstat",
    async (request): Promise<ApiResponse<{ diffstat: string }>> => {
      const { id } = request.params;
      const diffstatPath = join(ROOT, "reports", "runs", id, "diffstat.txt");

      if (!existsSync(diffstatPath)) {
        return { ok: false, error: "diffstat_not_found" };
      }

      const content = readFileSync(diffstatPath, "utf-8");
      return { ok: true, data: { diffstat: content } };
    }
  );
}
