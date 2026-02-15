import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { getDb } from "../db.js";
import { saveRequestValues, hasRequestValues, generateEnvRuntime, validateProvider, execScript } from "../vault.js";
import { taskHash as computeTaskHash } from "../contracts/directive_v1.js";
import type { TaskToCreate } from "../contracts/directive_v1.js";
import { requireProjectId, getProjectIdOrDefault, getProjectId, DEFAULT_PROJECT_ID } from "../projectScope.js";

// Helper: escribe una decision en decisions_log (fire-and-forget, no bloquea la respuesta)
function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  run_id?: string | null;
  directive_id?: string | null;
  project_id?: string | null;
}): void {
  const db = getDb();
  db.from("decisions_log").insert({
    source: opts.source,
    decision_key: opts.decision_key,
    decision_value: opts.decision_value,
    context: opts.context ?? null,
    run_id: opts.run_id ?? null,
    directive_id: opts.directive_id ?? null,
    project_id: opts.project_id ?? null,
  }).then(() => {}, () => {});
}

// ─── Types locales ──────────────────────────────────────────────────
interface Directive {
  id: string;
  created_at: string;
  source: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED";
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
  worker_id?: string;
  started_at?: string;
  attempts?: number;
  max_attempts?: number;
  next_run_at?: string;
  last_error?: string;
  claimed_by?: string;
  claimed_at?: string;
  finished_at?: string;
}

interface RunnerHeartbeat {
  id: string;
  runner_id: string;
  status: "online" | "offline";
  last_seen_at: string;
  meta?: Record<string, unknown>;
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  // TODO: agregar auth middleware en Fase 6

  // ─── REQUESTS ────────────────────────────────────────────────────

  app.get("/ops/requests", async (request): Promise<ApiResponse<OpsRequest[]>> => {
    const projectId = getProjectIdOrDefault(request);
    const db = getDb();
    const { data, error } = await db
      .from("ops_requests")
      .select("*")
      .eq("project_id", projectId)
      .order("id");
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as OpsRequest[] };
  });

  app.post<{ Body: OpsRequest }>(
    "/ops/requests",
    async (request, reply): Promise<ApiResponse<OpsRequest>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

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
        .upsert({ ...entry, project_id: projectId }, { onConflict: "id,project_id" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as OpsRequest };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string; provided_at?: string } }>(
    "/ops/requests/:id",
    async (request, reply): Promise<ApiResponse<OpsRequest>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

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
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as OpsRequest };
    }
  );

  // ─── VAULT (secrets locales) ─────────────────────────────────────

  app.post<{ Params: { id: string }; Body: { values: Record<string, string> } }>(
    "/ops/requests/:id/value",
    async (request, reply): Promise<ApiResponse<{ saved: boolean; env_runtime: string }>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const { values } = request.body as { values: Record<string, string> };

      if (!values || Object.keys(values).length === 0) {
        return { ok: false, error: "Se requiere al menos un valor" };
      }

      saveRequestValues(id, values, projectId);

      // Marcar request como PROVIDED
      const db = getDb();
      await db
        .from("ops_requests")
        .update({ status: "PROVIDED", provided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("project_id", projectId);

      const envPath = generateEnvRuntime(projectId);
      return { ok: true, data: { saved: true, env_runtime: envPath } };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/ops/requests/:id/value/status",
    async (request): Promise<ApiResponse<{ has_value: boolean }>> => {
      const projectId = getProjectIdOrDefault(request);
      const { id } = request.params;
      return { ok: true, data: { has_value: hasRequestValues(id, projectId) } };
    }
  );

  // ─── VALIDATE ──────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/ops/requests/:id/validate",
    async (request, reply): Promise<ApiResponse<{ ok: boolean; message: string }>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const result = await validateProvider(id, projectId);

      logDecision({
        source: "system",
        decision_key: result.ok ? "request_validated_ok" : "request_validated_failed",
        decision_value: { request_id: id, message: result.message },
        project_id: projectId,
      });

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
    async (request, reply): Promise<ApiResponse<ActionResult>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { action } = request.params;
      const scriptName = ACTION_SCRIPTS[action];
      if (!scriptName) {
        return { ok: false, error: `Accion desconocida: ${action}. Validas: ${Object.keys(ACTION_SCRIPTS).join(", ")}` };
      }
      const result = await execScript(scriptName, projectId);
      return { ok: true, data: result };
    }
  );

  // ─── DIRECTIVES ──────────────────────────────────────────────────

  app.get("/ops/directives", async (request): Promise<ApiResponse<Directive[]>> => {
    const projectId = getProjectIdOrDefault(request);
    const db = getDb();
    const { data, error } = await db
      .from("ops_directives")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Directive[] };
  });

  app.get<{ Params: { id: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const projectId = getProjectIdOrDefault(request);
      const { id } = request.params;
      const db = getDb();
      const { data, error } = await db
        .from("ops_directives")
        .select("*")
        .eq("id", id)
        .eq("project_id", projectId)
        .single();
      if (error) return { ok: false, error: `Directiva ${id} no encontrada` };
      return { ok: true, data: data as Directive };
    }
  );

  app.post<{ Body: Directive }>(
    "/ops/directives",
    async (request, reply): Promise<ApiResponse<Directive>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const body = request.body as Partial<Directive>;

      if (!body.id || !body.title) {
        return { ok: false, error: "id y title son requeridos" };
      }

      const entry = {
        id: body.id,
        source: body.source || "gpt",
        status: body.status || "PENDING_REVIEW",
        title: body.title,
        body: body.body || "",
        acceptance_criteria: body.acceptance_criteria || [],
        tasks_to_create: body.tasks_to_create || [],
        created_at: body.created_at || new Date().toISOString(),
        project_id: projectId,
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
    async (request, reply): Promise<ApiResponse<Directive>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const { status, rejection_reason } = request.body as {
        status: string;
        rejection_reason?: string;
      };

      const validStatuses = ["PENDING_REVIEW", "APPROVED", "REJECTED", "APPLIED"];
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
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };

      // Decision log: approve/reject
      if (status === "APPROVED" || status === "REJECTED") {
        logDecision({
          source: "human",
          decision_key: status === "APPROVED" ? "directive_approve" : "directive_reject",
          decision_value: { directive_id: id, status },
          context: rejection_reason ? { rejection_reason } : null,
          directive_id: id,
          project_id: projectId,
        });
      }

      return { ok: true, data: data as Directive };
    }
  );

  // ─── TASKS ───────────────────────────────────────────────────────

  app.get("/ops/tasks", async (request): Promise<ApiResponse<TaskEntry[]>> => {
    const projectId = getProjectIdOrDefault(request);
    const url = new URL(request.url, "http://localhost");
    const statusFilter = url.searchParams.get("status");
    const phaseFilter = url.searchParams.get("phase");

    const db = getDb();
    let query = db.from("ops_tasks").select("*").eq("project_id", projectId).order("id");
    if (statusFilter) query = query.eq("status", statusFilter);
    if (phaseFilter) query = query.eq("phase", Number(phaseFilter));

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as TaskEntry[] };
  });

  app.post<{ Body: TaskEntry }>(
    "/ops/tasks",
    async (request, reply): Promise<ApiResponse<TaskEntry>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

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
        project_id: projectId,
      };

      const db = getDb();
      const { data, error } = await db
        .from("ops_tasks")
        .upsert(entry, { onConflict: "id" })
        .select()
        .single();
      if (error) return { ok: false, error: error.message };

      // Decision log: task_created
      logDecision({
        source: "system",
        decision_key: "task_created",
        decision_value: { task_id: entry.id, title: entry.title, status: entry.status },
        directive_id: entry.directive_id || null,
        project_id: projectId,
      });

      return { ok: true, data: data as TaskEntry };
    }
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/ops/tasks/:id",
    async (request, reply): Promise<ApiResponse<TaskEntry>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const body = request.body as Record<string, unknown>;
      const status = body.status as string | undefined;

      const validStatuses = ["ready", "running", "done", "failed", "blocked"];
      if (status && !validStatuses.includes(status)) {
        return { ok: false, error: `Status invalido. Opciones: ${validStatuses.join(", ")}` };
      }

      // Build update payload — only set fields that are provided
      const allowed = ["status", "finished_at", "last_error", "attempts", "next_run_at", "claimed_by", "claimed_at", "worker_id"];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of allowed) {
        if (key in body) update[key] = body[key];
      }

      const db = getDb();
      const { data, error } = await db
        .from("ops_tasks")
        .update(update)
        .eq("id", id)
        .eq("project_id", projectId)
        .select()
        .single();
      if (error) return { ok: false, error: error.message };

      // Log decision on terminal status changes
      if (status === "done") {
        logDecision({
          source: "system",
          decision_key: "task_completed",
          decision_value: { task_id: id },
          project_id: projectId,
        });
      } else if (status === "failed") {
        logDecision({
          source: "system",
          decision_key: "task_failed",
          decision_value: { task_id: id, last_error: body.last_error || null },
          project_id: projectId,
        });
      }

      return { ok: true, data: data as TaskEntry };
    }
  );

  // POST /ops/tasks/claim — Atomic claim: server picks best eligible task
  // Input: { runner_id?: string }  (task_id optional for backwards compat)
  // Selection: status=ready, next_run_at respected, deps done, ORDER BY phase DESC, created_at ASC
  app.post<{ Body: { runner_id?: string; task_id?: string } }>(
    "/ops/tasks/claim",
    async (request, reply): Promise<ApiResponse<TaskEntry | null>> => {
      const { runner_id, task_id } = request.body as { runner_id?: string; task_id?: string };

      // Nullable: if present filter by project, if null (global runner) don't filter
      const projectId = getProjectId(request);

      const db = getDb();
      const now = new Date().toISOString();

      // 0. Verificar si el sistema está pausado
      const { data: systemState, error: stateError } = await db
        .from("ops_state")
        .select("value")
        .eq("key", "system_paused")
        .single();

      if (!stateError && systemState) {
        const isPaused = systemState.value === true || systemState.value === "true";
        if (isPaused) {
          reply.code(423);
          return { ok: false, error: "system_paused" };
        }
      }

      // 1. Fetch candidate tasks: READY, next_run_at respected, ordered by priority
      let query = db
        .from("ops_tasks")
        .select("*")
        .eq("status", "ready")
        .or(`next_run_at.is.null,next_run_at.lte.${now}`)
        .order("phase", { ascending: false })
        .order("created_at", { ascending: true });

      // If projectId present, scope to project; otherwise global runner sees all
      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      // If specific task_id requested (backwards compat), filter to it
      if (task_id) {
        query = query.eq("id", task_id);
      }

      const { data: candidates, error: fetchError } = await query;

      if (fetchError) {
        return { ok: false, error: fetchError.message };
      }

      if (!candidates || candidates.length === 0) {
        return { ok: true, data: null };
      }

      // 2. For each candidate, check deps — find first eligible
      for (const candidate of candidates) {
        const depends_on = (candidate.depends_on as string[]) || [];

        if (depends_on.length > 0) {
          const { data: depsData } = await db
            .from("ops_tasks")
            .select("id, status")
            .in("id", depends_on);

          const foundIds = new Set((depsData || []).map((d) => d.id as string));
          const missing = depends_on.filter((depId) => !foundIds.has(depId));

          // Deps inexistentes → marcar BLOCKED y loggear
          if (missing.length > 0) {
            await db
              .from("ops_tasks")
              .update({
                status: "blocked",
                last_error: `deps_not_found: ${missing.join(", ")}`,
                updated_at: now,
              })
              .eq("id", candidate.id);

            logDecision({
              source: "system",
              decision_key: "task_blocked_missing_deps",
              decision_value: { task_id: candidate.id, missing_deps: missing },
              project_id: (candidate.project_id as string) || null,
            });
            continue; // Skip to next candidate
          }

          const notDone = (depsData || []).filter((d) => d.status !== "done");
          if (notDone.length > 0) {
            continue; // Skip — deps not yet done
          }
        }

        // 3. Atomic claim: UPDATE with guards
        const { data: claimed, error: claimError } = await db
          .from("ops_tasks")
          .update({
            status: "running",
            worker_id: runner_id || "unknown",
            claimed_by: runner_id || "unknown",
            claimed_at: now,
            started_at: now,
            updated_at: now,
          })
          .eq("id", candidate.id)
          .eq("status", "ready")
          .or(`next_run_at.is.null,next_run_at.lte.${now}`)
          .select()
          .single();

        if (!claimError && claimed) {
          logDecision({
            source: "system",
            decision_key: "task_claimed",
            decision_value: { task_id: candidate.id, runner_id: runner_id || "unknown" },
            project_id: (candidate.project_id as string) || null,
          });
          return { ok: true, data: claimed as TaskEntry };
        }
        // If claim failed (race condition), try next candidate
      }

      // No eligible task found
      return { ok: true, data: null };
    }
  );

  // POST /ops/tasks/:id/requeue — Requeue task (increments attempts, backoff, or hard-stop)
  app.post<{ Params: { id: string }; Body: { backoff_seconds?: number; last_error?: string } }>(
    "/ops/tasks/:id/requeue",
    async (request, reply): Promise<ApiResponse<TaskEntry>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const { backoff_seconds = 10, last_error: callerError } = request.body as {
        backoff_seconds?: number;
        last_error?: string;
      };

      const db = getDb();
      const now = new Date();
      const nextRun = new Date(now.getTime() + backoff_seconds * 1000);

      // Fetch current attempts
      const { data: currentTask, error: fetchError } = await db
        .from("ops_tasks")
        .select("attempts, max_attempts")
        .eq("id", id)
        .eq("status", "running")
        .eq("project_id", projectId)
        .single();

      if (fetchError || !currentTask) {
        return { ok: false, error: "task_not_found_or_not_running" };
      }

      const attempts = ((currentTask.attempts as number) || 0) + 1;
      const max_attempts = (currentTask.max_attempts as number) || 3;
      const errorMsg = callerError || `requeued (${attempts}/${max_attempts})`;

      // Hard-stop: if reached max_attempts, set blocked instead of ready
      if (attempts >= max_attempts) {
        const { data: blockedData, error: blockedError } = await db
          .from("ops_tasks")
          .update({
            status: "blocked",
            attempts,
            finished_at: now.toISOString(),
            last_error: `max_attempts_reached (${attempts}/${max_attempts}): ${errorMsg}`,
            next_run_at: null,
            updated_at: now.toISOString(),
          })
          .eq("id", id)
          .eq("project_id", projectId)
          .select()
          .single();

        if (blockedError || !blockedData) {
          return { ok: false, error: "failed_to_block_task" };
        }

        logDecision({
          source: "system",
          decision_key: "task_blocked_max_attempts",
          decision_value: { task_id: id, attempts, max_attempts, last_error: errorMsg },
          project_id: projectId,
        });

        return { ok: true, data: blockedData as TaskEntry };
      }

      // Normal requeue: increment attempts, set next_run_at
      const { data, error } = await db
        .from("ops_tasks")
        .update({
          status: "ready",
          attempts,
          next_run_at: nextRun.toISOString(),
          last_error: errorMsg,
          claimed_by: null,
          claimed_at: null,
          worker_id: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .eq("status", "running")
        .eq("project_id", projectId)
        .select()
        .single();

      if (error || !data) {
        return { ok: false, error: "task_not_found_or_not_running" };
      }

      logDecision({
        source: "system",
        decision_key: "task_requeued",
        decision_value: { task_id: id, attempts, max_attempts, backoff_seconds, next_run_at: nextRun.toISOString() },
        project_id: projectId,
      });

      return { ok: true, data: data as TaskEntry };
    }
  );

  // ─── RUNNER HEARTBEAT ────────────────────────────────────────────────

  // POST /ops/runner/heartbeat — Upsert heartbeat
  app.post<{ Body: { runner_id: string; status?: string; meta?: Record<string, unknown> } }>(
    "/ops/runner/heartbeat",
    async (request): Promise<ApiResponse<RunnerHeartbeat>> => {
      const { runner_id, status = "online", meta } = request.body as {
        runner_id: string;
        status?: string;
        meta?: Record<string, unknown>;
      };

      if (!runner_id) {
        return { ok: false, error: "runner_id es requerido" };
      }

      const db = getDb();
      const entry = {
        runner_id,
        status,
        last_seen_at: new Date().toISOString(),
        meta: meta || {},
        project_id: DEFAULT_PROJECT_ID,
      };

      const { data, error } = await db
        .from("runner_heartbeats")
        .upsert(entry, { onConflict: "runner_id" })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      // Clean up other heartbeats from the same hostname (old PIDs)
      const hostname = (meta as Record<string, unknown>)?.hostname;
      if (hostname) {
        db.from("runner_heartbeats")
          .delete()
          .eq("project_id", DEFAULT_PROJECT_ID)
          .neq("runner_id", runner_id)
          .filter("meta->>hostname", "eq", String(hostname))
          .then(() => {});
      }

      logDecision({
        source: "runner",
        decision_key: "runner_heartbeat",
        decision_value: { runner_id, hostname: hostname ?? null },
        context: meta ? { meta } : null,
        project_id: DEFAULT_PROJECT_ID,
      });

      return { ok: true, data: data as RunnerHeartbeat };
    }
  );

  // GET /ops/runner/status — Get runner status (considers offline if last_seen > 60s ago)
  // Auto-cleans entries older than 5 min to avoid stale ghost runners
  // NOTE: Runners are global infrastructure — no project_id filter
  app.get("/ops/runner/status", async (): Promise<ApiResponse<RunnerHeartbeat[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("runner_heartbeats")
      .select("*")
      .order("last_seen_at", { ascending: false });

    if (error) return { ok: false, error: error.message };

    const now = new Date();
    const ONLINE_THRESHOLD = 60; // seconds
    const STALE_THRESHOLD = 300; // 5 min — auto-delete

    const fresh: RunnerHeartbeat[] = [];
    const staleIds: string[] = [];

    for (const r of data as RunnerHeartbeat[]) {
      const elapsed = (now.getTime() - new Date(r.last_seen_at).getTime()) / 1000;
      if (elapsed > STALE_THRESHOLD) {
        staleIds.push(r.id);
      } else {
        const computed_status: "online" | "offline" = elapsed > ONLINE_THRESHOLD ? "offline" : "online";
        fresh.push({ ...r, status: computed_status });
      }
    }

    // Auto-cleanup stale entries in background
    if (staleIds.length > 0) {
      db.from("runner_heartbeats").delete().in("id", staleIds).then(() => {});
    }

    return { ok: true, data: fresh };
  });

  // ─── METRICS ─────────────────────────────────────────────────────────

  interface OpsMetrics {
    tasks: {
      ready: number;
      running: number;
      blocked: number;
      failed: number;
      done: number;
    };
    runners: {
      online: number;
      total: number;
    };
    runs: {
      last_run_at: string | null;
      fail_rate_last_20: number | null;
      avg_ready_to_done_seconds_last_20: number | null;
      last_24h: number;
      fails_last_24h: number;
      deduped_last_24h: number;
      deduped_total: number;
    };
    backlog: {
      oldest_ready_age_seconds: number | null;
    };
  }

  // GET /ops/metrics — Operational metrics
  app.get("/ops/metrics", async (request): Promise<ApiResponse<OpsMetrics>> => {
    const projectId = getProjectIdOrDefault(request);
    const db = getDb();

    // 1. Task counts by status
    const { data: tasksData, error: tasksError } = await db.from("ops_tasks").select("status").eq("project_id", projectId);
    if (tasksError) return { ok: false, error: tasksError.message };

    const taskCounts = {
      ready: 0,
      running: 0,
      blocked: 0,
      failed: 0,
      done: 0,
    };
    (tasksData || []).forEach((t) => {
      const status = t.status as keyof typeof taskCounts;
      if (status in taskCounts) taskCounts[status]++;
    });

    // 2. Runners online/total (global — not scoped by project)
    const { data: runnersData, error: runnersError } = await db
      .from("runner_heartbeats")
      .select("last_seen_at");
    if (runnersError) return { ok: false, error: runnersError.message };

    const now = new Date();
    const onlineRunners = (runnersData || []).filter((r) => {
      const lastSeen = new Date(r.last_seen_at as string);
      const elapsed = (now.getTime() - lastSeen.getTime()) / 1000;
      return elapsed <= 60;
    }).length;
    const totalRunners = (runnersData || []).length;

    // 3. Runs metrics (last 20)
    const { data: runsData, error: runsError } = await db
      .from("run_logs")
      .select("started_at, finished_at, status")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false })
      .limit(20);

    let lastRunAt: string | null = null;
    let failRateLast20: number | null = null;
    let avgReadyToDoneLast20: number | null = null;

    if (!runsError && runsData && runsData.length > 0) {
      lastRunAt = runsData[0].started_at as string;

      const failedCount = runsData.filter((r) => r.status === "failed").length;
      failRateLast20 = failedCount / runsData.length;

      // Avg duration for done runs
      const doneDurations = runsData
        .filter((r) => r.status === "done" && r.finished_at)
        .map((r) => {
          const start = new Date(r.started_at as string);
          const end = new Date(r.finished_at as string);
          return (end.getTime() - start.getTime()) / 1000;
        });

      if (doneDurations.length > 0) {
        avgReadyToDoneLast20 = doneDurations.reduce((a, b) => a + b, 0) / doneDurations.length;
      }
    }

    // 4. Runs last 24h + deduped count
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: runs24h } = await db
      .from("run_logs")
      .select("status")
      .eq("project_id", projectId)
      .gte("started_at", oneDayAgo);

    const runsLast24h = (runs24h || []).filter((r) => r.status !== "deduped").length;
    const failsLast24h = (runs24h || []).filter((r) => r.status === "failed").length;
    const dedupedTotal = (runs24h || []).filter((r) => r.status === "deduped").length;

    // Count all deduped runs (not just 24h)
    const { count: allDedupedCount } = await db
      .from("run_logs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "deduped");

    // 5. Backlog: oldest ready task
    const { data: oldestReady, error: oldestError } = await db
      .from("ops_tasks")
      .select("created_at")
      .eq("status", "ready")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    let oldestReadyAge: number | null = null;
    if (!oldestError && oldestReady) {
      const createdAt = new Date(oldestReady.created_at as string);
      oldestReadyAge = (now.getTime() - createdAt.getTime()) / 1000;
    }

    return {
      ok: true,
      data: {
        tasks: taskCounts,
        runners: {
          online: onlineRunners,
          total: totalRunners,
        },
        runs: {
          last_run_at: lastRunAt,
          fail_rate_last_20: failRateLast20,
          avg_ready_to_done_seconds_last_20: avgReadyToDoneLast20,
          last_24h: runsLast24h,
          fails_last_24h: failsLast24h,
          deduped_last_24h: dedupedTotal,
          deduped_total: allDedupedCount ?? 0,
        },
        backlog: {
          oldest_ready_age_seconds: oldestReadyAge,
        },
      },
    };
  });

  // ─── SYSTEM CONTROL (PAUSE/RESUME) ───────────────────────────────────

  // GET /ops/system/status — Estado actual del sistema
  app.get("/ops/system/status", async (): Promise<ApiResponse<{ paused: boolean; updated_at: string | null }>> => {
    const db = getDb();
    const { data, error } = await db
      .from("ops_state")
      .select("value, updated_at")
      .eq("key", "system_paused")
      .single();

    if (error || !data) {
      return { ok: true, data: { paused: false, updated_at: null } };
    }

    const paused = data.value === true || data.value === "true";
    return { ok: true, data: { paused, updated_at: data.updated_at || null } };
  });

  // POST /ops/system/pause — Pausar claims (requiere X-ADMIN-TOKEN)
  app.post("/ops/system/pause", async (request, reply): Promise<ApiResponse<{ paused: boolean }>> => {
    // TODO: verificar X-ADMIN-TOKEN en Fase 6
    const db = getDb();
    const { error } = await db
      .from("ops_state")
      .upsert({ key: "system_paused", value: true, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return { ok: false, error: error.message };
    }

    logDecision({
      source: "human",
      decision_key: "system_pause",
      decision_value: { paused: true },
    });

    return { ok: true, data: { paused: true } };
  });

  // POST /ops/system/resume — Reanudar claims (requiere X-ADMIN-TOKEN)
  app.post("/ops/system/resume", async (request, reply): Promise<ApiResponse<{ paused: boolean }>> => {
    // TODO: verificar X-ADMIN-TOKEN en Fase 6
    const db = getDb();
    const { error } = await db
      .from("ops_state")
      .upsert({ key: "system_paused", value: false, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return { ok: false, error: error.message };
    }

    logDecision({
      source: "human",
      decision_key: "system_resume",
      decision_value: { paused: false },
    });

    return { ok: true, data: { paused: false } };
  });

  // ─── DIRECTIVE APPLICATION (idempotente + task_hash + required_requests) ─────

  // POST /ops/directives/:id/apply — Aplicar directiva aprobada
  // Idempotente: si ya está APPLIED devuelve OK sin duplicar tasks.
  // Task-level dedup: cada task tiene task_hash; si ya existe → skip.
  // Required_requests: si hay requests faltantes → no crear tasks, upsert requests MISSING.
  app.post<{ Params: { id: string } }>(
    "/ops/directives/:id/apply",
    async (request, reply): Promise<ApiResponse<{
      directive_id: string;
      tasks_created: number;
      tasks_skipped: number;
      blocked_by_requests: boolean;
      missing_requests: string[];
      idempotent: boolean;
    }>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return undefined as never;

      const { id } = request.params;
      const db = getDb();
      const now = new Date().toISOString();

      // 1. Obtener directiva
      const { data: directive, error: fetchError } = await db
        .from("ops_directives")
        .select("*")
        .eq("id", id)
        .eq("project_id", projectId)
        .single();

      if (fetchError || !directive) {
        reply.code(404);
        return { ok: false, error: "directive_not_found" };
      }

      // 2. Idempotente: ya aplicada → no-op
      if (directive.status === "APPLIED" && directive.applied_at) {
        return { ok: true, data: { directive_id: id, tasks_created: 0, tasks_skipped: 0, blocked_by_requests: false, missing_requests: [], idempotent: true } };
      }

      // 3. Verificar que esté aprobada
      if (directive.status !== "APPROVED") {
        reply.code(409);
        return { ok: false, error: `directive_not_approved (status: ${directive.status})` };
      }

      // 4. Idempotente por payload_hash: si otro directive con mismo hash ya fue APPLIED → no-op
      if (directive.payload_hash) {
        const { data: existing } = await db
          .from("ops_directives")
          .select("id")
          .eq("payload_hash", directive.payload_hash)
          .eq("status", "APPLIED")
          .eq("project_id", projectId)
          .neq("id", id)
          .limit(1);

        if (existing && existing.length > 0) {
          await db.from("ops_directives").update({
            status: "APPLIED",
            applied_at: now,
            applied_by: "system (hash_match)",
            updated_at: now,
          }).eq("id", id).eq("project_id", projectId);

          return { ok: true, data: { directive_id: id, tasks_created: 0, tasks_skipped: 0, blocked_by_requests: false, missing_requests: [], idempotent: true } };
        }
      }

      // 5. Required_requests enforcement
      const payloadJson = directive.payload_json as Record<string, unknown> | null;
      const requiredRequests = (payloadJson?.required_requests as Array<{ request_id: string; reason: string }>) || [];
      const missingReqIds: string[] = [];

      if (requiredRequests.length > 0) {
        // Fetch all requests from DB
        const { data: dbRequests } = await db
          .from("ops_requests")
          .select("id, status")
          .eq("project_id", projectId)
          .in("id", requiredRequests.map((r) => r.request_id));

        const reqMap = new Map((dbRequests || []).map((r) => [r.id, r.status]));

        for (const req of requiredRequests) {
          const status = reqMap.get(req.request_id);
          if (!status || status !== "PROVIDED") {
            missingReqIds.push(req.request_id);
            // Upsert request as MISSING if not exists or not PROVIDED
            await db.from("ops_requests").upsert({
              id: req.request_id,
              service: "unknown",
              type: "credentials",
              scopes: [],
              purpose: req.reason,
              where_to_set: "",
              validation_cmd: "",
              status: status === "PROVIDED" ? "PROVIDED" : "MISSING",
              project_id: projectId,
            }, { onConflict: "id,project_id" });
          }
        }

        if (missingReqIds.length > 0) {
          // Don't create tasks — mark directive and log
          logDecision({
            source: "system",
            decision_key: "directive_blocked_by_requests",
            decision_value: { directive_id: id, missing_requests: missingReqIds },
            directive_id: id,
            project_id: projectId,
          });

          return {
            ok: true,
            data: {
              directive_id: id,
              tasks_created: 0,
              tasks_skipped: 0,
              blocked_by_requests: true,
              missing_requests: missingReqIds,
              idempotent: false,
            },
          };
        }
      }

      // 6. Crear tasks
      // REGLA: dedup SOLO dentro de la misma directive (intra-directive).
      // Cross-directive dedup PROHIBIDO. Cada plan aprobado crea sus tasks.
      // DB garantiza: UNIQUE(directive_id, task_hash) — concurrencia segura.
      const tasksToCreate = (directive.tasks_to_create as unknown[]) || [];
      const directiveObjective = (payloadJson?.objective as string) || (directive.title as string) || "";
      const created: string[] = [];
      const skipped: string[] = [];
      let collisionsCount = 0;
      const seenHashes = new Set<string>();
      const applyStart = Date.now();

      // directive_apply_started — SIEMPRE se emite
      logDecision({
        source: "system",
        decision_key: "directive_apply_started",
        decision_value: { directive_id: id, tasks_count_expected: tasksToCreate.length },
        directive_id: id,
        project_id: projectId,
      });

      try {
        for (const task of tasksToCreate) {
          const t = task as Record<string, unknown>;
          const baseTaskId = (t.task_id || t.id || `T-GPT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`) as string;

          // Compute task_hash for intra-directive dedup
          const tHash = computeTaskHash(t as TaskToCreate, directiveObjective);

          // Intra-directive dedup (in-memory): skip if this exact task already appeared in this plan
          if (seenHashes.has(tHash)) {
            skipped.push(baseTaskId);
            logDecision({
              source: "system",
              decision_key: "task_skipped_dedup_intra_directive",
              decision_value: { task_id: baseTaskId, directive_id: id, task_hash: tHash },
              directive_id: id,
              project_id: projectId,
            });
            continue;
          }
          seenHashes.add(tHash);

          // Resolve task_id collision with retry (max 3 attempts)
          let finalTaskId = baseTaskId;
          const MAX_ID_RETRIES = 3;
          for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
            const { data: existingById } = await db
              .from("ops_tasks")
              .select("id")
              .eq("id", finalTaskId)
              .eq("project_id", projectId)
              .limit(1);

            if (!existingById || existingById.length === 0) break;

            const oldId = finalTaskId;
            finalTaskId = `T-GPT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            collisionsCount++;
            logDecision({
              source: "system",
              decision_key: "task_id_collision",
              decision_value: { old_task_id: oldId, new_task_id: finalTaskId, attempt: attempt + 1 },
              directive_id: id,
              project_id: projectId,
            });
          }

          // task_planned — intent to insert
          logDecision({
            source: "system",
            decision_key: "task_planned",
            decision_value: { task_id: finalTaskId, directive_id: id, title: (t.title as string) || "", task_hash: tHash },
            directive_id: id,
            project_id: projectId,
          });

          // Insert task — DB UNIQUE(directive_id, task_hash) handles concurrent dedup
          const { error: insertError } = await db
            .from("ops_tasks")
            .insert({
              id: finalTaskId,
              phase: (t.phase as number) || 0,
              title: (t.title as string) || "Sin titulo",
              status: "ready",
              branch: "main",
              depends_on: (t.depends_on as string[]) || [],
              blocked_by: [],
              directive_id: id,
              max_attempts: 3,
              task_hash: tHash,
              project_id: projectId,
            });

          if (!insertError) {
            created.push(finalTaskId);
            // task_inserted — confirmed in DB
            logDecision({
              source: "system",
              decision_key: "task_inserted",
              decision_value: { task_id: finalTaskId, directive_id: id },
              directive_id: id,
              project_id: projectId,
            });
          } else if (insertError.code === "23505") {
            // UNIQUE constraint violation — concurrent dedup (safe)
            skipped.push(finalTaskId);
            logDecision({
              source: "system",
              decision_key: "task_skipped_dedup_intra_directive",
              decision_value: { task_id: finalTaskId, directive_id: id, task_hash: tHash, reason: "db_unique_constraint" },
              directive_id: id,
              project_id: projectId,
            });
          } else {
            // Unexpected insert error — log but don't crash
            logDecision({
              source: "system",
              decision_key: "task_insert_error",
              decision_value: { task_id: finalTaskId, error: insertError.message, code: insertError.code },
              directive_id: id,
              project_id: projectId,
            });
          }
        }

        // 7. Marcar directiva como APPLIED
        await db.from("ops_directives").update({
          status: "APPLIED",
          applied_at: now,
          applied_by: "human",
          updated_at: now,
        }).eq("id", id).eq("project_id", projectId);

      } finally {
        // directive_apply_finished — SIEMPRE se emite (incluso si hubo error)
        const durationMs = Date.now() - applyStart;
        logDecision({
          source: "system",
          decision_key: "directive_apply_finished",
          decision_value: {
            directive_id: id,
            tasks_created: created,
            tasks_skipped: skipped,
            tasks_created_count: created.length,
            tasks_skipped_count: skipped.length,
            collisions_count: collisionsCount,
            duration_ms: durationMs,
          },
          context: { payload_hash: directive.payload_hash || null },
          directive_id: id,
          project_id: projectId,
        });
      }

      return {
        ok: true,
        data: {
          directive_id: id,
          tasks_created: created.length,
          tasks_skipped: skipped.length,
          blocked_by_requests: false,
          missing_requests: [],
          idempotent: false,
        },
      };
    }
  );
}
