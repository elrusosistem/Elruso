import { useEffect, useState, useCallback } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { OPERATOR_STAT_LABELS, humanizeRunnerName, humanizeRunnerStatus } from "../humanize";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  created_at?: string;
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
  const [loading, setLoading] = useState(true);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  // Action button states
  const [gptRunning, setGptRunning] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const fetchAll = useCallback(() => {
    const promises: Promise<unknown>[] = [
      apiFetch("/api/ops/metrics").then((r) => r.json()),
      apiFetch("/api/ops/runner/status").then((r) => r.json()),
    ];
    if (isOp) {
      promises.push(
        apiFetch("/api/ops/tasks?status=ready").then((r) => r.json()),
        apiFetch("/api/ops/system/status").then((r) => r.json()),
      );
    }
    Promise.all(promises)
      .then(([mData, rData, tData, sData]: unknown[]) => {
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

        {/* Runner offline alert */}
        {onlineRunners.length === 0 && runners.length > 0 && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-red-200 font-medium">Agente apagado: no se ejecutan tareas</span>
          </div>
        )}

        {/* 3 Top action buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={runGpt}
            disabled={gptRunning}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              gptRunning
                ? "bg-gray-600 cursor-not-allowed text-gray-400"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {gptRunning ? "Generando..." : "Generar plan (GPT)"}
          </button>
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

        {/* 4 key stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Pendientes" value={metrics.tasks.ready} color="text-blue-400" />
          <StatCard label="En curso" value={metrics.tasks.running} color="text-yellow-400" />
          <StatCard
            label="Necesitan configuracion"
            value={metrics.tasks.blocked}
            color={metrics.tasks.blocked > 0 ? "text-red-400" : "text-gray-400"}
            sub={metrics.tasks.blocked > 0 ? undefined : undefined}
          />
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

        {/* Runner detail (compact) */}
        {runners.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Agentes</h3>
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
          </div>
        )}
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
