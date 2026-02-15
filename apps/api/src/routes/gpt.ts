import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@elruso/types";
import { getDb } from "../db.js";
import { getRequestValues } from "../vault.js";
import { validateDirective, payloadHash } from "../contracts/directive_v1.js";
import type { DirectiveV1 } from "../contracts/directive_v1.js";
import { redactPatterns } from "../redact.js";
import OpenAI from "openai";
import { requireProjectId, getProjectIdOrDefault } from "../projectScope.js";

// ─── Helper: decisions_log (fire-and-forget) ──────────────────────
function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  directive_id?: string | null;
  project_id?: string | null;
}): void {
  const db = getDb();
  db.from("decisions_log").insert({
    source: opts.source,
    decision_key: opts.decision_key,
    decision_value: opts.decision_value,
    context: opts.context ?? null,
    directive_id: opts.directive_id ?? null,
    project_id: opts.project_id ?? null,
  }).then(() => {}, () => {});
}

// ─── State snapshot (for audit, no secrets) ───────────────────────
interface StateSnapshot {
  paused: boolean;
  runner_online: number;
  tasks_ready: number;
  tasks_running: number;
  tasks_done: number;
  tasks_blocked: number;
  tasks_failed: number;
  open_requests: number;
  recent_runs: number;
  timestamp: string;
}

async function buildStateSnapshot(projectId: string): Promise<StateSnapshot> {
  const db = getDb();

  // ops_state: keep global (pause is system-wide)
  const { data: sysState } = await db.from("ops_state").select("value").eq("key", "system_paused").single();
  const paused = sysState ? sysState.value === true || sysState.value === "true" : false;

  const { data: tasks } = await db.from("ops_tasks").select("status").eq("project_id", projectId);
  const counts: Record<string, number> = {};
  for (const t of tasks || []) counts[t.status] = (counts[t.status] || 0) + 1;

  // runner_heartbeats: keep global (infra)
  const now = new Date();
  const { data: runners } = await db.from("runner_heartbeats").select("last_seen_at");
  const onlineRunners = (runners || []).filter((r) => {
    return (now.getTime() - new Date(r.last_seen_at as string).getTime()) / 1000 <= 60;
  }).length;

  const { data: reqs } = await db.from("ops_requests").select("status").eq("project_id", projectId).in("status", ["WAITING", "MISSING", "NEEDED"]);
  const { count: recentRuns } = await db.from("run_logs").select("id", { count: "exact", head: true }).eq("project_id", projectId);

  return {
    paused,
    runner_online: onlineRunners,
    tasks_ready: counts["ready"] || 0,
    tasks_running: counts["running"] || 0,
    tasks_done: counts["done"] || 0,
    tasks_blocked: counts["blocked"] || 0,
    tasks_failed: counts["failed"] || 0,
    open_requests: (reqs || []).length,
    recent_runs: recentRuns ?? 0,
    timestamp: now.toISOString(),
  };
}

// ─── Preconditions: verificar si se puede planificar ─────────────
interface PreconditionResult {
  canPlan: boolean;
  reasons: string[];
  activeObjectives: { id: string; title: string; description: string; priority: number; profile: string }[];
  missingRequests: { id: string; purpose: string }[];
}

async function checkPlanningPreconditions(projectId: string): Promise<PreconditionResult> {
  const db = getDb();
  const reasons: string[] = [];

  // 1. Wizard completado?
  const { data: wizardData } = await db
    .from("wizard_state")
    .select("has_completed_wizard")
    .eq("project_id", projectId)
    .single();

  if (!wizardData || !wizardData.has_completed_wizard) {
    reasons.push("wizard_not_completed");
  }

  // 2. Objetivos activos?
  const { data: objectives } = await db
    .from("objectives")
    .select("id, title, description, priority, profile")
    .eq("status", "active")
    .eq("project_id", projectId);

  if (!objectives || objectives.length === 0) {
    reasons.push("no_active_objectives");
  }

  // 3. Requests obligatorias completas?
  const { data: requiredReqs } = await db
    .from("ops_requests")
    .select("id, purpose, status")
    .eq("required_for_planning", true)
    .eq("project_id", projectId);

  const missing = (requiredReqs || []).filter(
    (r) => r.status !== "PROVIDED",
  );

  if (missing.length > 0) {
    reasons.push("missing_required_requests");
  }

  return {
    canPlan: reasons.length === 0,
    reasons,
    activeObjectives: (objectives || []) as PreconditionResult["activeObjectives"],
    missingRequests: missing.map((r) => ({ id: r.id, purpose: r.purpose })),
  };
}

// ─── Compose: prompt estructurado con secciones fijas ─────────────
async function composeContext(projectId: string): Promise<{ prompt: string; state_snapshot: StateSnapshot }> {
  const db = getDb();
  const snapshot = await buildStateSnapshot(projectId);

  // Tasks READY (max 20)
  const { data: readyTasks } = await db
    .from("ops_tasks")
    .select("id, title, depends_on, priority")
    .eq("status", "ready")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(20);

  // Open requests (max 20)
  const { data: openReqs } = await db
    .from("ops_requests")
    .select("id, service, purpose, status")
    .in("status", ["WAITING", "MISSING", "NEEDED"])
    .eq("project_id", projectId)
    .order("id")
    .limit(20);

  // All requests for context
  const { data: allReqs } = await db
    .from("ops_requests")
    .select("id, service, status")
    .eq("project_id", projectId)
    .order("id");

  // Last 3 runs (summary redacted)
  const { data: lastRuns } = await db
    .from("run_logs")
    .select("task_id, status, summary, started_at")
    .neq("status", "deduped")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(3);

  // Last 10 decisions
  const { data: lastDecisions } = await db
    .from("decisions_log")
    .select("decision_key, decision_value, source, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Pending directives (to avoid duplicates)
  const { data: pendingDirs } = await db
    .from("ops_directives")
    .select("id, title, status")
    .in("status", ["PENDING_REVIEW", "APPROVED"])
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Active objectives
  const { data: activeObjectives } = await db
    .from("objectives")
    .select("id, title, description, priority, profile")
    .eq("status", "active")
    .eq("project_id", projectId)
    .order("priority", { ascending: true });

  const readyTasksSection = (readyTasks || []).length > 0
    ? (readyTasks || []).map((t) =>
        `- ${t.id}: ${t.title}${(t.depends_on as string[])?.length ? ` [deps: ${(t.depends_on as string[]).join(",")}]` : ""}`
      ).join("\n")
    : "- (ninguna)";

  const openReqsSection = (openReqs || []).length > 0
    ? (openReqs || []).map((r) => `- ${r.id}: [${r.status}] ${r.service} — ${r.purpose}`).join("\n")
    : "- (ninguna pendiente)";

  const allReqsSection = (allReqs || []).map((r) => `- ${r.id}: ${r.service} [${r.status}]`).join("\n");

  const runsSection = (lastRuns || []).length > 0
    ? (lastRuns || []).map((r) => `- ${r.task_id}: ${r.status} — ${r.summary || "(sin summary)"}`).join("\n")
    : "- (sin runs)";

  const decisionsSection = (lastDecisions || []).length > 0
    ? (lastDecisions || []).map((d) => {
        const val = d.decision_value as Record<string, unknown>;
        const brief = Object.entries(val).map(([k, v]) => `${k}=${v}`).join(", ");
        return `- [${d.source}] ${d.decision_key}: ${brief}`;
      }).join("\n")
    : "- (sin decisiones)";

  const pendingDirsSection = (pendingDirs || []).length > 0
    ? (pendingDirs || []).map((d) => `- ${d.id}: [${d.status}] ${d.title}`).join("\n")
    : "- (ninguna)";

  const objectivesSection = (activeObjectives || []).length > 0
    ? (activeObjectives || []).map((o) =>
        `- [P${o.priority}] ${o.title}: ${o.description || "(sin descripcion)"} [perfil: ${o.profile}]`
      ).join("\n")
    : "- (sin objetivos activos)";

  const rawPrompt = `# CONTEXTO — El Ruso (Orquestador)

Sos el orquestador estrategico. Analiza el estado y genera directivas.

## OBJETIVOS ACTIVOS
${objectivesSection}

## OUTPUT REQUERIDO

Responde SOLO con un JSON array. Sin texto antes ni despues. Cada elemento sigue el contrato directive_v1:

\`\`\`json
[
  {
    "version": "directive_v1",
    "directive_schema_version": "v1",
    "objective": "Que hay que lograr (min 10 chars, max 500)",
    "context_summary": "Por que ahora y que contexto tiene (max 2000)",
    "risks": [{"id":"R1","text":"Descripcion del riesgo (max 500)","severity":"low|med|high"}],
    "tasks_to_create": [
      {
        "task_id": "T-GPT-<unico>",
        "task_type": "feature|bugfix|infra|docs|test",
        "title": "Titulo de la task (max 200)",
        "steps": ["Paso 1", "Paso 2"],
        "depends_on": ["T-XXX"],
        "priority": 3,
        "phase": 0,
        "params": {},
        "acceptance_criteria": ["Criterio verificable"],
        "description": "Que hacer concretamente (max 2000)"
      }
    ],
    "required_requests": [{"request_id":"REQ-XXX","reason":"Por que se necesita"}],
    "success_criteria": ["Criterio de exito verificable de la directiva"],
    "estimated_impact": "Descripcion del impacto esperado",
    "apply_notes": "Notas para el humano que aprueba"
  }
]
\`\`\`

## STATE

- Pausado: ${snapshot.paused ? "SI" : "NO"}
- Runner online: ${snapshot.runner_online}
- Fecha: ${snapshot.timestamp}

## TASK COUNTS

- ready: ${snapshot.tasks_ready}
- running: ${snapshot.tasks_running}
- done: ${snapshot.tasks_done}
- blocked: ${snapshot.tasks_blocked}
- failed: ${snapshot.tasks_failed}

## TOP TASKS READY (max 20)
${readyTasksSection}

## OPEN REQUESTS
${openReqsSection}

## ALL REQUESTS
${allReqsSection}

## DIRECTIVAS PENDIENTES (no duplicar)
${pendingDirsSection}

## LAST RUNS (max 3)
${runsSection}

## LAST DECISIONS (max 10)
${decisionsSection}

## RULES

1. Solo directivas accionables. No filosofia.
2. tasks_to_create NO puede estar vacio si la directiva pretende cambios.
3. risks requiere al menos 1 entrada.
4. success_criteria requiere al menos 1 entrada.
5. estimated_impact es obligatorio.
6. No pedir cosas bloqueadas por REQUESTS sin resolver.
7. Stack fijo: Node 22, TypeScript, Fastify, Supabase, Vite+React+Tailwind.
8. Priorizar: lo que desbloquea mas tareas primero.
9. Idioma: espanol. Max 3 directivas.
10. No crear tasks que ya existan (ver backlog).
11. No duplicar directivas pendientes de review.
12. NO incluir secretos, tokens o API keys en el output.
13. El output DEBE ser JSON valido que matchee el schema directive_v1 de arriba.
14. Todas las directivas deben alinearse con al menos un objetivo activo.
15. No generar tareas fuera del scope de los objetivos definidos.

---

Analiza y genera directivas. Prioriza lo que mas avanza los objetivos activos.`;

  // Apply redact as defense layer (no secrets should be in prompt, but just in case)
  const prompt = redactPatterns(rawPrompt);

  return { prompt, state_snapshot: snapshot };
}

// ─── Parsear respuesta de GPT → directive_v1[] ────────────────────

function parseAndValidateGptResponse(content: string): { directives: DirectiveV1[]; errors: string[] } {
  let json = content.trim();

  // Quitar markdown code fences si existen
  const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    json = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta de GPT no es un JSON array");
  }

  const directives: DirectiveV1[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const result = validateDirective(parsed[i]);
    if (result.ok) {
      directives.push(result.data);
    } else {
      errors.push(`Directiva[${i}]: ${result.error}`);
    }
  }

  return { directives, errors };
}

// ─── Routes ───────────────────────────────────────────────────────
export async function gptRoutes(app: FastifyInstance): Promise<void> {

  // GET /ops/gpt/preconditions — verificar si se puede planificar
  app.get("/ops/gpt/preconditions", async (request): Promise<ApiResponse<PreconditionResult>> => {
    try {
      const projectId = getProjectIdOrDefault(request);
      const result = await checkPlanningPreconditions(projectId);
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, error: `Error verificando precondiciones: ${(e as Error).message}` };
    }
  });

  // POST /ops/gpt/compose — genera el prompt de contexto (sin llamar a GPT)
  app.post("/ops/gpt/compose", async (request, reply): Promise<ApiResponse<{ prompt: string; state_snapshot: StateSnapshot; char_count: number }> | void> => {
    try {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return;
      const { prompt, state_snapshot } = await composeContext(projectId);
      return { ok: true, data: { prompt, state_snapshot, char_count: prompt.length } };
    } catch (e) {
      return { ok: false, error: `Error componiendo contexto: ${(e as Error).message}` };
    }
  });

  // POST /ops/gpt/run — pipeline: contexto → GPT → validate directive_v1 → persist PENDING_REVIEW
  app.post("/ops/gpt/run", async (request, reply): Promise<ApiResponse<{
    directives_created: number;
    directives_skipped: number;
    validation_errors: string[];
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  }> | void> => {
    const projectId = requireProjectId(request, reply);
    if (!projectId) return;

    // 0. Log gpt_run_started
    logDecision({
      source: "system",
      decision_key: "gpt_run_started",
      decision_value: { triggered_by: "api" },
      project_id: projectId,
    });

    // 0.5 Guardrails: verificar precondiciones
    try {
      const preconditions = await checkPlanningPreconditions(projectId);
      if (!preconditions.canPlan) {
        logDecision({
          source: "system",
          decision_key: "gpt_run_blocked",
          decision_value: {
            reasons: preconditions.reasons,
            missing_requests: preconditions.missingRequests,
          },
          project_id: projectId,
        });
        return {
          ok: false,
          error: `No se puede generar plan: ${preconditions.reasons.map((r) => {
            if (r === "wizard_not_completed") return "Falta completar la configuracion inicial";
            if (r === "no_active_objectives") return "No hay objetivos activos";
            if (r === "missing_required_requests") return "Faltan datos de configuracion requeridos";
            return r;
          }).join(". ")}`,
        };
      }
    } catch {
      // Si falla la verificacion (ej: tabla no existe todavia), continuar
    }

    // 1. API key
    const openaiValues = getRequestValues("REQ-009", projectId);
    const apiKey = openaiValues?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logDecision({
        source: "system",
        decision_key: "gpt_run_failed",
        decision_value: { reason: "OPENAI_API_KEY not available" },
        project_id: projectId,
      });
      return { ok: false, error: "OPENAI_API_KEY no disponible." };
    }

    // 2. Compose
    let prompt: string;
    let stateSnapshot: StateSnapshot;
    try {
      const composed = await composeContext(projectId);
      prompt = composed.prompt;
      stateSnapshot = composed.state_snapshot;
    } catch (e) {
      logDecision({
        source: "system",
        decision_key: "gpt_run_failed",
        decision_value: { reason: "compose_error", error: (e as Error).message },
        project_id: projectId,
      });
      return { ok: false, error: `Error componiendo contexto: ${(e as Error).message}` };
    }

    // 3. Llamar a OpenAI
    const openai = new OpenAI({ apiKey });
    let gptResponse: string;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
    const model = "gpt-4.1";

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "Sos el orquestador estrategico de El Ruso. Responde SOLO con un JSON array siguiendo el contrato directive_v1. Sin texto adicional. Todos los campos obligatorios deben estar presentes: version, objective, risks (min 1), tasks_to_create (min 1), success_criteria (min 1), estimated_impact.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      gptResponse = completion.choices[0]?.message?.content ?? "";
      if (completion.usage) {
        usage = {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        };
      }
    } catch (e) {
      logDecision({
        source: "system",
        decision_key: "gpt_run_failed",
        decision_value: { reason: "openai_api_error", error: redactPatterns((e as Error).message) },
        project_id: projectId,
      });
      return { ok: false, error: `Error llamando a OpenAI: ${(e as Error).message}` };
    }

    if (!gptResponse) {
      logDecision({
        source: "system",
        decision_key: "gpt_run_failed",
        decision_value: { reason: "empty_response" },
        project_id: projectId,
      });
      return { ok: false, error: "GPT devolvio respuesta vacia" };
    }

    // 4. Parsear + validar con zod
    let directives: DirectiveV1[];
    let validationErrors: string[];
    try {
      const result = parseAndValidateGptResponse(gptResponse);
      directives = result.directives;
      validationErrors = result.errors;
    } catch (e) {
      logDecision({
        source: "system",
        decision_key: "gpt_run_failed",
        decision_value: { reason: "parse_error", error: (e as Error).message },
        project_id: projectId,
      });
      return { ok: false, error: `Error parseando respuesta de GPT: ${(e as Error).message}. Raw: ${gptResponse.substring(0, 500)}` };
    }

    // Log validation failures
    if (validationErrors.length > 0) {
      logDecision({
        source: "system",
        decision_key: "gpt_directive_validation_failed",
        decision_value: { errors: validationErrors, count: validationErrors.length },
        project_id: projectId,
      });
    }

    if (directives.length === 0) {
      return {
        ok: false,
        error: `Ninguna directiva pasó validación. Errores: ${validationErrors.join(" | ")}`,
      };
    }

    // 5. Persistir directivas validadas (con idempotencia por payload_hash)
    const db = getDb();
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;

    for (const directive of directives) {
      const hash = payloadHash(directive);

      // Idempotencia: si payload_hash ya existe → skip
      const { data: existing } = await db
        .from("ops_directives")
        .select("id")
        .eq("payload_hash", hash)
        .eq("project_id", projectId)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      const directiveId = `DIR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      await db.from("ops_directives").insert({
        id: directiveId,
        source: "gpt",
        status: "PENDING_REVIEW",
        title: directive.objective.substring(0, 120),
        body: directive.context_summary || directive.objective,
        acceptance_criteria: directive.tasks_to_create.flatMap((t) => t.acceptance_criteria),
        tasks_to_create: directive.tasks_to_create,
        payload_json: directive,
        payload_hash: hash,
        directive_schema_version: directive.directive_schema_version || "v1",
        created_at: now,
        project_id: projectId,
      });

      logDecision({
        source: "gpt",
        decision_key: "gpt_directive_created",
        decision_value: {
          directive_id: directiveId,
          objective: directive.objective.substring(0, 120),
          tasks_count: directive.tasks_to_create.length,
          risks_count: directive.risks.length,
          payload_hash: hash,
        },
        context: { state_snapshot: stateSnapshot },
        directive_id: directiveId,
        project_id: projectId,
      });

      created++;
    }

    request.log.info({
      directives_created: created,
      directives_skipped: skipped,
      validation_errors: validationErrors.length,
      model,
      tokens: usage?.total_tokens,
    }, "GPT run completado (directive_v1)");

    return {
      ok: true,
      data: {
        directives_created: created,
        directives_skipped: skipped,
        validation_errors: validationErrors,
        model,
        usage,
      },
    };
  });
}
