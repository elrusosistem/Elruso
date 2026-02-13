import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { getDb } from "../db.js";
import { saveRequestValues, hasRequestValues, generateEnvRuntime, validateProvider, execScript } from "../vault.js";

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

  // POST /ops/tasks/claim — Atomic claim with eligibility check (deps + next_run_at + system_paused)
  app.post<{ Body: { task_id: string; runner_id: string } }>(
    "/ops/tasks/claim",
    async (request, reply): Promise<ApiResponse<TaskEntry>> => {
      const { task_id, runner_id } = request.body as { task_id: string; runner_id: string };

      if (!task_id || !runner_id) {
        return { ok: false, error: "task_id y runner_id son requeridos" };
      }

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
          reply.code(423); // 423 Locked
          return { ok: false, error: "system_paused" };
        }
      }

      // 1. Verificar deps: obtener task y chequear que depends_on estén DONE
      const { data: taskData, error: fetchError } = await db
        .from("ops_tasks")
        .select("depends_on")
        .eq("id", task_id)
        .single();

      if (fetchError || !taskData) {
        reply.code(404);
        return { ok: false, error: "task_not_found" };
      }

      const depends_on = (taskData.depends_on as string[]) || [];
      if (depends_on.length > 0) {
        // Verificar que todas las deps estén done
        const { data: depsData, error: depsError } = await db
          .from("ops_tasks")
          .select("id, status")
          .in("id", depends_on);

        if (depsError) {
          return { ok: false, error: "error_checking_dependencies" };
        }

        const notDone = (depsData || []).filter((d) => d.status !== "done");
        if (notDone.length > 0) {
          reply.code(409);
          return { ok: false, error: `dependencies_not_done: ${notDone.map((d) => d.id).join(", ")}` };
        }
      }

      // 2. Atomic update: solo si status='ready' AND (next_run_at is null OR next_run_at <= now)
      const { data, error } = await db
        .from("ops_tasks")
        .update({
          status: "running",
          worker_id: runner_id,
          claimed_by: runner_id,
          claimed_at: now,
          started_at: now,
          updated_at: now,
        })
        .eq("id", task_id)
        .eq("status", "ready")
        .or(`next_run_at.is.null,next_run_at.lte.${now}`)
        .select()
        .single();

      if (error || !data) {
        reply.code(409);
        return { ok: false, error: "task_not_eligible_or_already_claimed" };
      }

      return { ok: true, data: data as TaskEntry };
    }
  );

  // POST /ops/tasks/:id/requeue — Requeue stuck task (increments attempts)
  app.post<{ Params: { id: string }; Body: { backoff_seconds?: number } }>(
    "/ops/tasks/:id/requeue",
    async (request): Promise<ApiResponse<TaskEntry>> => {
      const { id } = request.params;
      const { backoff_seconds = 10 } = request.body as { backoff_seconds?: number };

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

      // Hard-stop: if reached max_attempts, set blocked instead of ready
      if (attempts >= max_attempts) {
        const { data: blockedData, error: blockedError } = await db
          .from("ops_tasks")
          .update({
            status: "blocked",
            attempts,
            finished_at: now.toISOString(),
            last_error: `max_attempts_reached (${attempts}/${max_attempts})`,
            updated_at: now.toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (blockedError || !blockedData) {
          return { ok: false, error: "failed_to_block_task" };
        }

        return { ok: true, data: blockedData as TaskEntry };
      }

      // Normal requeue: increment attempts, set next_run_at
      const { data, error } = await db
        .from("ops_tasks")
        .update({
          status: "ready",
          attempts,
          next_run_at: nextRun.toISOString(),
          last_error: `timeout_requeued (${attempts}/${max_attempts})`,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .eq("status", "running")
        .select()
        .single();

      if (error || !data) {
        return { ok: false, error: "task_not_found_or_not_running" };
      }

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

    // 4. Backlog: oldest ready task
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

    return { ok: true, data: { paused: false } };
  });

  // ─── DIRECTIVE APPLICATION ───────────────────────────────────────────

  // POST /ops/directives/:id/apply — Aplicar directiva aprobada (requiere X-ADMIN-TOKEN)
  app.post<{ Params: { id: string } }>(
    "/ops/directives/:id/apply",
    async (request, reply): Promise<ApiResponse<{ directive_id: string; tasks_created: number }>> => {
      const { id } = request.params;

      // TODO: verificar X-ADMIN-TOKEN en Fase 6

      const db = getDb();

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

      // 2. Verificar que esté aprobada
      if (directive.status !== "APPROVED") {
        reply.code(400);
        return { ok: false, error: `directive_not_approved (status: ${directive.status})` };
      }

      // 3. Crear tasks desde tasks_to_create
      const tasksToCreate = (directive.tasks_to_create as unknown[]) || [];
      const created: string[] = [];

      for (const task of tasksToCreate) {
        const taskEntry = task as TaskEntry;
        const { error: insertError } = await db
          .from("ops_tasks")
          .upsert(
            {
              id: taskEntry.id,
              phase: taskEntry.phase || 0,
              title: taskEntry.title,
              status: taskEntry.status || "ready",
              branch: taskEntry.branch || "main",
              depends_on: taskEntry.depends_on || [],
              blocked_by: taskEntry.blocked_by || [],
              directive_id: id,
              max_attempts: taskEntry.max_attempts || 3,
            },
            { onConflict: "id" }
          );

        if (!insertError) {
          created.push(taskEntry.id);
        }
      }

      // 4. Marcar directiva como APPLIED
      await db
        .from("ops_directives")
        .update({
          status: "APPLIED",
          applied_at: new Date().toISOString(),
          applied_by: "human",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      return { ok: true, data: { directive_id: id, tasks_created: created.length } };
    }
  );
}
