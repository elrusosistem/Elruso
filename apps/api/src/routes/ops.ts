import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { getDb } from "../db.js";
import { saveRequestValues, hasRequestValues, generateEnvRuntime, validateProvider, execScript } from "../vault.js";

// Helper: escribe una decision en decisions_log (fire-and-forget, no bloquea la respuesta)
function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  run_id?: string | null;
  directive_id?: string | null;
}): void {
  const db = getDb();
  db.from("decisions_log").insert({
    source: opts.source,
    decision_key: opts.decision_key,
    decision_value: opts.decision_value,
    context: opts.context ?? null,
    run_id: opts.run_id ?? null,
    directive_id: opts.directive_id ?? null,
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
        status: body.status || "PENDING_REVIEW",
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
        });
      }

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

      // Decision log: task_created
      logDecision({
        source: "system",
        decision_key: "task_created",
        decision_value: { task_id: entry.id, title: entry.title, status: entry.status },
        directive_id: entry.directive_id || null,
      });

      return { ok: true, data: data as TaskEntry };
    }
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/ops/tasks/:id",
    async (request): Promise<ApiResponse<TaskEntry>> => {
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
        .select()
        .single();
      if (error) return { ok: false, error: error.message };

      // Log decision on terminal status changes
      if (status === "done") {
        logDecision({
          source: "system",
          decision_key: "task_completed",
          decision_value: { task_id: id },
        });
      } else if (status === "failed") {
        logDecision({
          source: "system",
          decision_key: "task_failed",
          decision_value: { task_id: id, last_error: body.last_error || null },
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
    async (request): Promise<ApiResponse<TaskEntry>> => {
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
          .select()
          .single();

        if (blockedError || !blockedData) {
          return { ok: false, error: "failed_to_block_task" };
        }

        logDecision({
          source: "system",
          decision_key: "task_blocked_max_attempts",
          decision_value: { task_id: id, attempts, max_attempts, last_error: errorMsg },
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
        .select()
        .single();

      if (error || !data) {
        return { ok: false, error: "task_not_found_or_not_running" };
      }

      logDecision({
        source: "system",
        decision_key: "task_requeued",
        decision_value: { task_id: id, attempts, max_attempts, backoff_seconds, next_run_at: nextRun.toISOString() },
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
      };

      const { data, error } = await db
        .from("runner_heartbeats")
        .upsert(entry, { onConflict: "runner_id" })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      logDecision({
        source: "runner",
        decision_key: "runner_heartbeat",
        decision_value: { runner_id, hostname: (meta as Record<string, unknown>)?.hostname ?? null },
        context: meta ? { meta } : null,
      });

      return { ok: true, data: data as RunnerHeartbeat };
    }
  );

  // GET /ops/runner/status — Get runner status (considers offline if last_seen > 60s ago)
  app.get("/ops/runner/status", async (): Promise<ApiResponse<RunnerHeartbeat[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("runner_heartbeats")
      .select("*")
      .order("last_seen_at", { ascending: false });

    if (error) return { ok: false, error: error.message };

    // Compute offline status based on last_seen_at (60s threshold)
    const now = new Date();
    const enriched = (data as RunnerHeartbeat[]).map((r) => {
      const lastSeen = new Date(r.last_seen_at);
      const elapsed = (now.getTime() - lastSeen.getTime()) / 1000;
      const computed_status: "online" | "offline" = elapsed > 60 ? "offline" : "online";
      return { ...r, status: computed_status };
    });

    return { ok: true, data: enriched };
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
  app.get("/ops/metrics", async (): Promise<ApiResponse<OpsMetrics>> => {
    const db = getDb();

    // 1. Task counts by status
    const { data: tasksData, error: tasksError } = await db.from("ops_tasks").select("status");
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

    // 2. Runners online/total
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
      .gte("started_at", oneDayAgo);

    const runsLast24h = (runs24h || []).filter((r) => r.status !== "deduped").length;
    const failsLast24h = (runs24h || []).filter((r) => r.status === "failed").length;
    const dedupedTotal = (runs24h || []).filter((r) => r.status === "deduped").length;

    // Count all deduped runs (not just 24h)
    const { count: allDedupedCount } = await db
      .from("run_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "deduped");

    // 5. Backlog: oldest ready task
    const { data: oldestReady, error: oldestError } = await db
      .from("ops_tasks")
      .select("created_at")
      .eq("status", "ready")
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

  // ─── DIRECTIVE APPLICATION (idempotente) ───────────────────────────

  // POST /ops/directives/:id/apply — Aplicar directiva aprobada
  // Idempotente: si ya está APPLIED devuelve OK sin duplicar tasks.
  // Si payload_hash ya fue aplicado por otra directiva, retorna no-op.
  app.post<{ Params: { id: string } }>(
    "/ops/directives/:id/apply",
    async (request, reply): Promise<ApiResponse<{ directive_id: string; tasks_created: number; idempotent: boolean }>> => {
      const { id } = request.params;
      const db = getDb();
      const now = new Date().toISOString();

      // 1. Obtener directiva
      const { data: directive, error: fetchError } = await db
        .from("ops_directives")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !directive) {
        reply.code(404);
        return { ok: false, error: "directive_not_found" };
      }

      // 2. Idempotente: ya aplicada → no-op
      if (directive.status === "APPLIED" && directive.applied_at) {
        return { ok: true, data: { directive_id: id, tasks_created: 0, idempotent: true } };
      }

      // 3. Verificar que esté aprobada
      if (directive.status !== "APPROVED") {
        reply.code(409);
        return { ok: false, error: `directive_not_approved (status: ${directive.status})` };
      }

      // 4. Idempotente por hash: si otro directive con mismo hash ya fue APPLIED → no-op
      if (directive.payload_hash) {
        const { data: existing } = await db
          .from("ops_directives")
          .select("id")
          .eq("payload_hash", directive.payload_hash)
          .eq("status", "APPLIED")
          .neq("id", id)
          .limit(1);

        if (existing && existing.length > 0) {
          // Marcar esta como APPLIED también (misma payload ya ejecutada)
          await db.from("ops_directives").update({
            status: "APPLIED",
            applied_at: now,
            applied_by: "system (hash_match)",
            updated_at: now,
          }).eq("id", id);

          return { ok: true, data: { directive_id: id, tasks_created: 0, idempotent: true } };
        }
      }

      // 5. Crear tasks (upsert por task_id para no duplicar)
      const tasksToCreate = (directive.tasks_to_create as unknown[]) || [];
      const created: string[] = [];

      for (const task of tasksToCreate) {
        const t = task as Record<string, unknown>;
        const taskId = (t.task_id || t.id || `T-GPT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`) as string;

        const { error: insertError } = await db
          .from("ops_tasks")
          .upsert(
            {
              id: taskId,
              phase: (t.phase as number) || 0,
              title: (t.title as string) || "Sin titulo",
              status: "ready",
              branch: "main",
              depends_on: (t.depends_on as string[]) || [],
              blocked_by: [],
              directive_id: id,
              max_attempts: 3,
            },
            { onConflict: "id" }
          );

        if (!insertError) {
          created.push(taskId);
        }
      }

      // 6. Marcar directiva como APPLIED
      await db.from("ops_directives").update({
        status: "APPLIED",
        applied_at: now,
        applied_by: "human",
        updated_at: now,
      }).eq("id", id);

      // 7. Registrar en decisions_log
      await db.from("decisions_log").insert({
        source: "system",
        decision_key: "directive_apply",
        decision_value: { directive_id: id, tasks_created: created },
        context: { payload_hash: directive.payload_hash || null },
        directive_id: id,
        created_at: now,
      });

      return { ok: true, data: { directive_id: id, tasks_created: created.length, idempotent: false } };
    }
  );
}
