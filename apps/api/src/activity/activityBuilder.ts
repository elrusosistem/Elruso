import type { DecisionLog, ActivityEvent, ActivityEventType } from "@elruso/types";

// ─── Narrativas singulares ──────────────────────────────────────────
const NARRATIVES: Record<string, string> = {
  gpt_run_started: "ElRuso comenzo a analizar el proyecto",
  gpt_directive_created: "Propuso un nuevo plan",
  gpt_run_failed: "Error al generar plan",
  gpt_run_blocked: "Plan bloqueado por precondiciones",
  gpt_directive_validation_failed: "Plan invalido descartado",
  directive_approve: "Plan aprobado por el usuario",
  directive_reject: "Plan rechazado por el usuario",
  directive_apply: "Se activo el plan",
  directive_blocked_by_requests: "Plan bloqueado por datos faltantes",
  task_planned: "Se creo una tarea",
  task_created: "Se creo una tarea",
  task_claimed: "Comenzo a ejecutar una tarea",
  task_completed: "Finalizo una tarea",
  task_failed: "Una tarea fallo",
  task_requeued: "Se reintentara una tarea",
  task_blocked_max_attempts: "Tarea fallo tras reintentos",
  task_skipped_duplicate: "Tarea duplicada omitida",
  task_noop_detected: "Tarea ejecutada sin efecto",
  task_no_actionable_steps: "Tarea sin handler disponible",
  run_completed: "Ejecucion completada",
  run_failed: "La ejecucion fallo",
  backlog_cleanup: "Se optimizo el backlog",
  system_pause: "Sistema pausado",
  system_resume: "Sistema reanudado",
  objective_created: "Nuevo objetivo creado",
  objective_activated: "Objetivo activado",
  objective_paused: "Objetivo pausado",
  wizard_completed: "Configuracion inicial completada",
  auto_requests_created: "Configuracion requerida generada",
  request_validated_ok: "Credencial validada correctamente",
  request_validated_failed: "Validacion de credencial fallo",
};

// ─── Narrativas plurales ────────────────────────────────────────────
const PLURALS: Record<string, string> = {
  task_planned: "Se crearon {n} tareas",
  task_created: "Se crearon {n} tareas",
  task_claimed: "Se ejecutaron {n} tareas",
  task_completed: "Se finalizaron {n} tareas",
  task_failed: "{n} tareas fallaron",
  task_requeued: "Se reintentaran {n} tareas",
  task_skipped_duplicate: "{n} tareas duplicadas omitidas",
  task_noop_detected: "{n} tareas ejecutadas sin efecto",
  task_no_actionable_steps: "{n} tareas sin handler disponible",
  run_completed: "{n} ejecuciones completadas",
  run_failed: "{n} ejecuciones fallaron",
  request_validated_ok: "{n} credenciales validadas",
  request_validated_failed: "{n} validaciones de credencial fallaron",
  objective_created: "{n} objetivos creados",
  auto_requests_created: "{n} configuraciones requeridas generadas",
};

// ─── Tipo de evento ─────────────────────────────────────────────────
function getEventType(key: string): ActivityEventType {
  if (key.includes("failed") || key.includes("blocked") || key.includes("noop") || key.includes("no_actionable") || key === "directive_reject") return "error";
  if (key.startsWith("gpt_") || key.startsWith("directive_")) return "plan";
  if (key.startsWith("task_")) return "task";
  if (key === "run_completed") return "run";
  return "system";
}

// ─── Eventos a excluir ──────────────────────────────────────────────
const EXCLUDED_KEYS = new Set(["runner_heartbeat", "run_patch_saved"]);

const GROUP_WINDOW_MS = 60_000;

export function buildActivityStream(rows: DecisionLog[], limit: number): ActivityEvent[] {
  // 1. Filter excluded keys
  const filtered = rows.filter((r) => !EXCLUDED_KEYS.has(r.decision_key));

  // 2. Group consecutive events with same decision_key within 60s
  const groups: { rows: DecisionLog[]; key: string }[] = [];

  for (const row of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.key === row.decision_key) {
      const lastTs = new Date(last.rows[last.rows.length - 1].created_at).getTime();
      const curTs = new Date(row.created_at).getTime();
      if (Math.abs(lastTs - curTs) <= GROUP_WINDOW_MS) {
        last.rows.push(row);
        continue;
      }
    }
    groups.push({ rows: [row], key: row.decision_key });
  }

  // 3. Build ActivityEvent from each group
  const events: ActivityEvent[] = groups.slice(0, limit).map((group) => {
    const first = group.rows[0];
    const count = group.rows.length;
    const key = group.key;

    let narrative: string;
    if (count > 1 && PLURALS[key]) {
      narrative = PLURALS[key].replace("{n}", String(count));
    } else {
      narrative = NARRATIVES[key] ?? key;
    }

    return {
      id: first.id,
      timestamp: first.created_at,
      narrative,
      type: getEventType(key),
      count,
      related_task_id: extractId(group.rows, "decision_value", "task_id"),
      related_run_id: first.run_id ?? undefined,
      related_directive_id: first.directive_id ?? undefined,
      source: first.source,
      decision_key: key,
      raw: first.decision_value,
    };
  });

  return events;
}

function extractId(
  rows: DecisionLog[],
  field: "decision_value" | "context",
  prop: string,
): string | undefined {
  for (const r of rows) {
    const obj = r[field];
    if (obj && typeof obj === "object" && prop in obj) {
      const val = (obj as Record<string, unknown>)[prop];
      if (typeof val === "string") return val;
    }
  }
  return undefined;
}
