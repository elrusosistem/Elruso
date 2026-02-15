/** Human-friendly translations for the operator mode UI */

// --- Task status ---
const TASK_STATUS_MAP: Record<string, { label: string; tone: string }> = {
  ready: { label: "Pendiente", tone: "text-blue-400" },
  running: { label: "En curso", tone: "text-yellow-400" },
  done: { label: "Listo", tone: "text-green-400" },
  failed: { label: "Fallo", tone: "text-red-400" },
  blocked: { label: "Necesita configuracion", tone: "text-red-400" },
  deduped: { label: "Ignorado (duplicado)", tone: "text-gray-400" },
};

export function humanizeTaskStatus(status: string): { label: string; tone: string } {
  return TASK_STATUS_MAP[status] ?? { label: status, tone: "text-gray-400" };
}

// --- Directive status ---
const DIRECTIVE_STATUS_MAP: Record<string, string> = {
  PENDING_REVIEW: "Pendiente de aprobacion",
  APPROVED: "Aprobada",
  APPLIED: "Aplicada",
  REJECTED: "Rechazada",
};

export function humanizeDirectiveStatus(status: string): string {
  return DIRECTIVE_STATUS_MAP[status] ?? status;
}

// --- Runner ---
export function humanizeRunnerName(runnerId: string, hostname?: string): string {
  if (hostname && /macbook|imac|mac\s?pro/i.test(hostname)) return "Agente local";
  // runner-elruso-53428 -> Agente #53428
  const match = runnerId.match(/(\d+)$/);
  if (match) return `Agente #${match[1]}`;
  return runnerId;
}

export function humanizeRunnerStatus(status: string, lastSeenAt?: string): string {
  if (status === "online") return "Online";
  if (!lastSeenAt) return "Offline";
  return `Offline (${formatTimeAgo(lastSeenAt)})`;
}

// --- Run status ---
const RUN_STATUS_MAP: Record<string, string> = {
  running: "En curso",
  done: "OK",
  failed: "Fallo",
  blocked: "Bloqueada",
  deduped: "Duplicada",
};

export function humanizeRunStatus(status: string): string {
  return RUN_STATUS_MAP[status] ?? status;
}

// --- Decision keys ---
const DECISION_KEY_MAP: Record<string, string> = {
  directive_approve: "Se aprobo un plan",
  directive_reject: "Se rechazo un plan",
  directive_apply: "Se ejecuto un plan",
  directive_blocked_by_requests: "Plan bloqueado por datos faltantes",
  system_pause: "Sistema pausado",
  system_resume: "Sistema reanudado",
  task_created: "Se creo una tarea",
  task_claimed: "Agente tomo una tarea",
  task_completed: "Tarea completada",
  task_requeued: "Se reintentara una tarea",
  task_blocked_max_attempts: "Tarea fallo tras reintentos",
  task_planned: "Tarea planificada",
  task_skipped_duplicate: "Tarea ya existente (omitida)",
  run_completed: "Ejecucion completada",
  run_failed: "Ejecucion fallida",
  run_patch_saved: "Cambios registrados",
  runner_heartbeat: "Agente activo",
  backlog_cleanup: "Limpieza de tareas",
  gpt_run_started: "Generando plan",
  gpt_directive_created: "Plan generado",
  gpt_directive_validation_failed: "Plan invalido",
  gpt_run_failed: "Error al generar plan",
  gpt_run_blocked: "Plan bloqueado por precondiciones",
  objective_created: "Objetivo creado",
  objective_activated: "Objetivo activado",
  objective_paused: "Objetivo pausado",
  wizard_completed: "Configuracion inicial completada",
  auto_requests_created: "Configuracion requerida generada",
  request_validated_ok: "Validacion de credencial exitosa",
  request_validated_failed: "Validacion de credencial fallida",
};

export function humanizeDecisionKey(key: string): string {
  return DECISION_KEY_MAP[key] ?? key.replace(/_/g, " ");
}

// --- Time formatting ---
export function formatTimeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 0) return "ahora";
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`;
  return `hace ${Math.round(diff / 86400)}d`;
}

export function formatNextRun(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const diff = (new Date(dateStr).getTime() - Date.now()) / 1000;
  if (diff <= 0) return "Proximo intento: ahora";
  if (diff < 60) return `Proximo intento en ${Math.round(diff)}s`;
  if (diff < 3600) return `Proximo intento en ${Math.round(diff / 60)} min`;
  const date = new Date(dateStr);
  return `Proximo intento a las ${date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

// --- Task filtering for operator mode ---
const TEST_TASK_PATTERN = /^(T-TEST|T-SMOKE|T-CLAIM|T-AUDIT|T-LOOP|T-STUCK|T-DUMMY|SANDBOX|EXAMPLE|DEMO)/i;
const TEST_TITLE_PATTERN = /\b(smoke.?test|claim.?test|dummy|sandbox|example)\b/i;

export function isTestTask(id: string, title?: string): boolean {
  if (TEST_TASK_PATTERN.test(id)) return true;
  if (title && TEST_TITLE_PATTERN.test(title)) return true;
  return false;
}

export function isOperatorVisible(task: { id: string; title?: string; status: string }): boolean {
  // Hide done and deduped in operator mode
  if (task.status === "done" || task.status === "deduped") return false;
  // Hide test tasks
  if (isTestTask(task.id, task.title)) return false;
  return true;
}

// --- Nav labels ---
export const OPERATOR_NAV_LABELS: Record<string, string> = {
  Dashboard: "Inicio",
  Runs: "Ejecuciones",
  Tasks: "Tareas",
  Objetivos: "Objetivos",
  Directivas: "Planes",
  Decisions: "Registro",
  Requests: "Configuracion",
  Setup: "Setup", // hidden in operator mode
};

// --- Stat card labels ---
export const OPERATOR_STAT_LABELS: Record<string, string> = {
  "Tasks Ready": "Pendientes",
  "Tasks Running": "En progreso",
  "Tasks Done": "Completadas",
  "Tasks Failed": "Con error",
  "Runners": "Agentes",
  "Runs (24h)": "Ejecuciones (24h)",
  "Fail Rate": "Tasa de fallos",
  "Avg Duration": "Tiempo promedio",
  "Backlog Age": "Antiguedad backlog",
  "Deduped": "Duplicadas evitadas",
};
