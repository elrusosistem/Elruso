import { useEffect, useState, useCallback } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { OPERATOR_STAT_LABELS, humanizeRunnerName, humanizeRunnerStatus } from "../humanize";
import { Tooltip } from "../components/Tooltip";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  created_at?: string;
}

interface ChecklistState {
  hasPlan: boolean;
  hasApproved: boolean;
  hasDoneTask: boolean;
  hasSuccessRun: boolean;
}

interface Metrics {
  tasks: { ready: number; running: number; blocked: number; failed: number; done: number };
  runners: { online: number; total: number };
  runs: {
    last_run_at: string | null;
    fail_rate_last_20: number | null;
    avg_ready_to_done_seconds_last_20: number | null;
    last_24h: number;
    fails_last_24h: number;
    deduped_last_24h: number;
    deduped_total: number;
  };
  backlog: { oldest_ready_age_seconds: number | null };
}

interface Runner {
  runner_id: string;
  status: string;
  last_seen_at: string;
  meta: { hostname?: string; pid?: number } | null;
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [nextTasks, setNextTasks] = useState<TaskEntry[]>([]);
  const [checklist, setChecklist] = useState<ChecklistState>({ hasPlan: false, hasApproved: false, hasDoneTask: false, hasSuccessRun: false });
  const [loading, setLoading] = useState(true);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  // Action button states
  const [gptRunning, setGptRunning] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // VM control
  const [vmStatus, setVmStatus] = useState<string | null>(null);
  const [vmConfigured, setVmConfigured] = useState(false);
  const [vmLoading, setVmLoading] = useState(false);

  // Wizard + preconditions
  const [wizardDone, setWizardDone] = useState<boolean | null>(null);
  const [canPlan, setCanPlan] = useState(true);
  const [planBlockReason, setPlanBlockReason] = useState<string>("");
  const [activeObjectives, setActiveObjectives] = useState<{ id: string; title: string; priority: number }[]>([]);

  const fetchAll = useCallback(() => {
    const promises: Promise<unknown>[] = [
      apiFetch("/api/ops/metrics").then((r) => r.json()),
      apiFetch("/api/ops/runner/status").then((r) => r.json()),
    ];
    if (isOp) {
      promises.push(
        apiFetch("/api/ops/tasks?status=ready").then((r) => r.json()),
        apiFetch("/api/ops/system/status").then((r) => r.json()),
        apiFetch("/api/ops/directives").then((r) => r.json()),
        apiFetch("/api/runs").then((r) => r.json()),
        apiFetch("/api/ops/wizard/status").then((r) => r.json()),
        apiFetch("/api/ops/gpt/preconditions").then((r) => r.json()),
        apiFetch("/api/ops/runner/vm").then((r) => r.json()),
      );
    }
    Promise.all(promises)
      .then(([mData, rData, tData, sData, dData, runsData, wizData, preData, vmData]: unknown[]) => {
        const m = mData as ApiResponse<Metrics>;
        const r = rData as ApiResponse<Runner[]>;
        if (m.ok && m.data) setMetrics(m.data);
        if (r.ok && r.data) setRunners(r.data);
        if (tData) {
          const t = tData as ApiResponse<TaskEntry[]>;
          if (t.ok && t.data) {
            const sorted = [...t.data].sort((a, b) => a.phase - b.phase);
            setNextTasks(sorted.slice(0, 5));
          }
        }
        if (sData) {
          const s = sData as ApiResponse<{ paused: boolean }>;
          if (s.ok && s.data) setPaused(s.data.paused);
        }
        // Wizard + preconditions
        if (wizData) {
          const wiz = wizData as ApiResponse<{ has_completed_wizard: boolean }>;
          if (wiz.ok && wiz.data) setWizardDone(wiz.data.has_completed_wizard);
        }
        if (preData) {
          const pre = preData as ApiResponse<{ canPlan: boolean; reasons: string[]; activeObjectives: { id: string; title: string; priority: number }[] }>;
          if (pre.ok && pre.data) {
            setCanPlan(pre.data.canPlan);
            setActiveObjectives(pre.data.activeObjectives || []);
            if (!pre.data.canPlan) {
              const reasonMap: Record<string, string> = {
                wizard_not_completed: "Completa la configuracion inicial",
                no_active_objectives: "No hay objetivos activos",
                missing_required_requests: "Faltan datos de configuracion",
              };
              setPlanBlockReason(pre.data.reasons.map((r: string) => reasonMap[r] ?? r).join(". "));
            }
          }
        }
        // VM status
        if (vmData) {
          const vm = vmData as ApiResponse<{ vm_status: string; configured: boolean }>;
          if (vm.ok && vm.data) {
            setVmStatus(vm.data.vm_status);
            setVmConfigured(vm.data.configured);
          }
        }
        // Checklist detection
        if (dData && runsData) {
          const dirs = (dData as ApiResponse<{ status: string }[]>).data ?? [];
          const runs = (runsData as ApiResponse<{ status: string }[]>).data ?? [];
          const tasks = m.ok && m.data ? m.data.tasks : { done: 0, ready: 0, running: 0, blocked: 0, failed: 0 };
          setChecklist({
            hasPlan: dirs.length > 0,
            hasApproved: dirs.some((d) => d.status === "APPROVED" || d.status === "APPLIED"),
            hasDoneTask: tasks.done > 0,
            hasSuccessRun: runs.some((r) => r.status === "done"),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOp]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;
  if (!metrics) return <div className="p-8 text-red-400">Error cargando datos</div>;

  const onlineRunners = runners.filter((r) => r.status === "online");
  const failRate = metrics.runs.fail_rate_last_20;
  const label = (key: string) => (isOp ? OPERATOR_STAT_LABELS[key] ?? key : key);

  // --- Action handlers (operator) ---
  const runGpt = async () => {
    setGptRunning(true);
    setActionMsg(null);
    try {
      const res = await apiFetch("/api/ops/gpt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg({ type: "ok", text: "Plan generado. Revisalo en Planes." });
      } else {
        const msg = res.status === 401
          ? "No autorizado: falta token"
          : data.error ?? `Error ${res.status}`;
        setActionMsg({ type: "error", text: msg });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de conexion";
      setActionMsg({ type: "error", text: msg });
    } finally {
      setGptRunning(false);
    }
  };

  const togglePause = async () => {
    setPauseLoading(true);
    setActionMsg(null);
    try {
      const endpoint = paused ? "/api/ops/system/resume" : "/api/ops/system/pause";
      const res = await apiFetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPaused(!paused);
        setActionMsg({ type: "ok", text: paused ? "Sistema reanudado" : "Sistema pausado" });
      } else {
        setActionMsg({ type: "error", text: data.error ?? "Error" });
      }
    } catch {
      setActionMsg({ type: "error", text: "Error de conexion" });
    } finally {
      setPauseLoading(false);
    }
  };

  const vmAction = async (action: "start" | "stop" | "reset") => {
    setVmLoading(true);
    setActionMsg(null);
    try {
      const res = await apiFetch(`/api/ops/runner/vm/${action}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const labels: Record<string, string> = { start: "VM arrancando...", stop: "VM apagandose...", reset: "VM reiniciando..." };
        setActionMsg({ type: "ok", text: labels[action] });
        // Refresh after a few seconds
        setTimeout(fetchAll, 5000);
      } else {
        setActionMsg({ type: "error", text: data.error ?? "Error" });
      }
    } catch {
      setActionMsg({ type: "error", text: "Error de conexion" });
    } finally {
      setVmLoading(false);
    }
  };

  const refresh = () => {
    setActionMsg(null);
    setLoading(true);
    fetchAll();
    setActionMsg({ type: "ok", text: "Actualizado" });
    setTimeout(() => setActionMsg(null), 2000);
  };

  // =====================
  // OPERATOR MODE
  // =====================
  if (isOp) {
    return (
      <div className="p-8 max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">Inicio</h2>

        {/* Wizard banner */}
        {wizardDone === false && (
          <div className="mb-6 p-5 bg-indigo-900/30 border border-indigo-600 rounded-lg">
            <h3 className="text-lg font-semibold mb-1">Para empezar, necesitamos conocer tu negocio</h3>
            <p className="text-sm text-gray-400 mb-4">
              Completa una configuracion rapida para que el sistema sepa que hacer.
            </p>
            <a
              href="#/strategy-wizard"
              className="inline-block px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
            >
              Definir estrategia
            </a>
          </div>
        )}

        {/* Runner / VM status alert */}
        {onlineRunners.length === 0 && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-red-200 font-medium">
                {vmConfigured && vmStatus !== "running"
                  ? "VM apagada — el agente no puede correr"
                  : "Agente offline — no se ejecutan tareas"}
              </span>
            </div>
            {vmConfigured && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-400">VM: {vmStatus ?? "?"}</span>
                {vmStatus !== "running" ? (
                  <button
                    onClick={() => vmAction("start")}
                    disabled={vmLoading}
                    className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors"
                  >
                    {vmLoading ? "..." : "Prender VM"}
                  </button>
                ) : (
                  <button
                    onClick={() => vmAction("reset")}
                    disabled={vmLoading}
                    className="px-3 py-1 text-xs bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 rounded transition-colors"
                  >
                    {vmLoading ? "..." : "Reiniciar VM"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3 Top action buttons with tooltips */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Tooltip text={!canPlan ? planBlockReason : "La IA analiza el sistema y propone mejoras"}>
            <button
              onClick={runGpt}
              disabled={gptRunning || !canPlan}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                gptRunning || !canPlan
                  ? "bg-gray-600 cursor-not-allowed text-gray-400"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {gptRunning ? "Generando..." : "Generar plan (GPT)"}
            </button>
          </Tooltip>
          <Tooltip text={paused ? "Reanudar la ejecucion de tareas" : "Detener temporalmente todas las tareas"}>
            <button
              onClick={togglePause}
              disabled={pauseLoading}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                paused
                  ? "bg-green-700 hover:bg-green-600 text-white"
                  : "bg-yellow-700 hover:bg-yellow-600 text-white"
              }`}
            >
              {pauseLoading ? "..." : paused ? "Reanudar" : "Pausar"}
            </button>
          </Tooltip>
          <button
            onClick={refresh}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Actualizar
          </button>
        </div>

        {/* Action feedback */}
        {actionMsg && (
          <div className={`mb-6 text-sm ${actionMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>
            {actionMsg.text}
          </div>
        )}

        {/* 4 key stats with tooltips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Pendientes" value={metrics.tasks.ready} color="text-blue-400" />
          <Tooltip text="Tareas que el sistema esta ejecutando ahora">
            <div className="w-full"><StatCard label="En curso" value={metrics.tasks.running} color="text-yellow-400" /></div>
          </Tooltip>
          <Tooltip text="Falta una clave o dato para continuar">
            <div className="w-full"><StatCard
              label="Necesitan configuracion"
              value={metrics.tasks.blocked}
              color={metrics.tasks.blocked > 0 ? "text-red-400" : "text-gray-400"}
            /></div>
          </Tooltip>
          <StatCard
            label="Agente"
            value={onlineRunners.length > 0 ? "Activo" : "Apagado"}
            color={onlineRunners.length > 0 ? "text-green-400" : "text-red-400"}
          />
        </div>

        {/* Blocked → link to configuration */}
        {metrics.tasks.blocked > 0 && (
          <div className="mb-6 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <span className="text-yellow-300 text-sm">
              Hay {metrics.tasks.blocked} tarea(s) que necesitan datos para avanzar.
            </span>
            <a href="#/requests" className="text-sm text-blue-400 hover:underline ml-2">
              Ir a Configuracion
            </a>
          </div>
        )}

        {/* Checklist: Como empezar */}
        <div className="mb-8 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Como empezar</h3>
          <div className="space-y-2">
            {[
              { done: checklist.hasPlan, label: "Generar plan", sub: "Crear una propuesta con el boton de arriba" },
              { done: checklist.hasApproved, label: "Aprobar plan", sub: "Revisar y aprobar en Planes" },
              { done: checklist.hasDoneTask, label: "Esperar ejecucion", sub: "El sistema trabaja solo" },
              { done: checklist.hasSuccessRun, label: "Revisar resultados", sub: "Ver que cambio en Ejecuciones" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${
                  step.done ? "bg-green-900 text-green-400" : "bg-gray-700 text-gray-500"
                }`}>
                  {step.done ? "\u2713" : (i + 1)}
                </span>
                <div>
                  <span className={`text-sm ${step.done ? "text-green-400 line-through" : "text-gray-200"}`}>{step.label}</span>
                  {!step.done && <p className="text-xs text-gray-500">{step.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Objetivos activos */}
        {activeObjectives.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3">Objetivos activos</h3>
            <div className="space-y-2">
              {activeObjectives.map((obj) => (
                <div key={obj.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm text-gray-200 flex-1">{obj.title}</span>
                  <span className="text-xs text-gray-500">P{obj.priority}</span>
                </div>
              ))}
            </div>
            <a href="#/objectives" className="text-xs text-blue-400 hover:underline mt-2 inline-block">
              Ver todos los objetivos
            </a>
          </div>
        )}

        {/* Lo próximo — top 5 ready tasks */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3">Lo proximo</h3>
          {nextTasks.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay tareas pendientes.</p>
          ) : (
            <div className="space-y-2">
              {nextTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-sm text-gray-200 flex-1">{t.title}</span>
                </div>
              ))}
            </div>
          )}
          {nextTasks.length > 0 && (
            <a href="#/tasks" className="text-xs text-blue-400 hover:underline mt-2 inline-block">
              Ver todas las tareas
            </a>
          )}
        </div>

        {/* Agente + VM control */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Agente</h3>

          {/* VM control bar */}
          {vmConfigured && (
            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${vmStatus === "running" ? "bg-green-500" : vmStatus === "staging" || vmStatus === "stopping" ? "bg-yellow-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-sm text-gray-200 flex-1">
                VM {vmStatus === "running" ? "encendida" : vmStatus === "terminated" || vmStatus === "stopped" ? "apagada" : vmStatus ?? "?"}
              </span>
              <div className="flex gap-2">
                {vmStatus === "running" ? (
                  <>
                    <button onClick={() => vmAction("reset")} disabled={vmLoading} className="px-3 py-1 text-xs bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 rounded transition-colors">
                      {vmLoading ? "..." : "Reiniciar"}
                    </button>
                    <button onClick={() => vmAction("stop")} disabled={vmLoading} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 disabled:bg-gray-600 rounded transition-colors">
                      {vmLoading ? "..." : "Apagar"}
                    </button>
                  </>
                ) : vmStatus === "terminated" || vmStatus === "stopped" ? (
                  <button onClick={() => vmAction("start")} disabled={vmLoading} className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors">
                    {vmLoading ? "..." : "Prender"}
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Runner heartbeats */}
          {runners.length > 0 && (
            <div className="space-y-2">
              {[...runners]
                .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
                .slice(0, 3)
                .map((r) => (
                  <div key={r.runner_id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${r.status === "online" ? "bg-green-500" : "bg-gray-600"}`} />
                    <span className="flex-1 text-gray-200">{humanizeRunnerName(r.runner_id, r.meta?.hostname)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${r.status === "online" ? "bg-green-900 text-green-400" : "bg-gray-700 text-gray-500"}`}>
                      {humanizeRunnerStatus(r.status, r.last_seen_at)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {!vmConfigured && runners.length === 0 && (
            <p className="text-sm text-gray-500">Sin agentes registrados.</p>
          )}
        </div>
      </div>
    );
  }

  // =====================
  // TECHNICAL MODE (unchanged)
  // =====================
  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={label("Tasks Ready")} value={metrics.tasks.ready} color="text-blue-400" />
        <StatCard label={label("Tasks Running")} value={metrics.tasks.running} color="text-yellow-400" />
        <StatCard label={label("Tasks Done")} value={metrics.tasks.done} color="text-green-400" />
        <StatCard label={label("Tasks Failed")} value={metrics.tasks.failed} color={metrics.tasks.failed > 0 ? "text-red-400" : "text-gray-400"} />
        <StatCard
          label={label("Runners")}
          value={`${onlineRunners.length} / ${runners.length}`}
          color={onlineRunners.length > 0 ? "text-green-400" : "text-red-400"}
          sub={onlineRunners.length > 0 ? "online" : "todos offline"}
        />
        <StatCard
          label={label("Runs (24h)")}
          value={metrics.runs.last_24h}
          sub={metrics.runs.fails_last_24h > 0 ? `${metrics.runs.fails_last_24h} failed` : undefined}
        />
        <StatCard
          label={label("Fail Rate")}
          value={failRate != null ? `${(failRate * 100).toFixed(0)}%` : "-"}
          color={failRate != null && failRate > 0.2 ? "text-red-400" : "text-green-400"}
          sub="ultimos 20 runs"
        />
        <StatCard
          label={label("Avg Duration")}
          value={formatAge(metrics.runs.avg_ready_to_done_seconds_last_20)}
          sub="ready → done"
        />
        <StatCard
          label={label("Backlog Age")}
          value={formatAge(metrics.backlog.oldest_ready_age_seconds)}
          color={metrics.backlog.oldest_ready_age_seconds && metrics.backlog.oldest_ready_age_seconds > 86400 ? "text-yellow-400" : "text-gray-300"}
          sub="task mas vieja"
        />
        <StatCard
          label={label("Deduped")}
          value={metrics.runs.deduped_total}
          sub={metrics.runs.deduped_last_24h > 0 ? `${metrics.runs.deduped_last_24h} hoy` : undefined}
          color="text-gray-400"
        />
      </div>

      {/* Runners detail */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3">Runners</h3>
        {runners.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin runners registrados.</p>
        ) : (
          <div className="space-y-2">
            {runners.map((r) => (
              <div key={r.runner_id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${r.status === "online" ? "bg-green-500" : "bg-gray-600"}`} />
                <span className="font-mono text-gray-300 flex-1">{r.runner_id}</span>
                {r.meta?.hostname && <span className="text-gray-500">{r.meta.hostname}</span>}
                <span className="text-xs text-gray-500">
                  {new Date(r.last_seen_at).toLocaleString("es-AR")}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded uppercase ${r.status === "online" ? "bg-green-900 text-green-400" : "bg-gray-700 text-gray-500"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Last run */}
      {metrics.runs.last_run_at && (
        <div className="text-xs text-gray-600">
          Ultimo run: {new Date(metrics.runs.last_run_at).toLocaleString("es-AR")}
        </div>
      )}
    </div>
  );
}
