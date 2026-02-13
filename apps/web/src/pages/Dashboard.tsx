import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";

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
  const [loading, setLoading] = useState(true);

  const fetchAll = () => {
    Promise.all([
      apiFetch("/api/ops/metrics").then((r) => r.json()),
      apiFetch("/api/ops/runner/status").then((r) => r.json()),
    ])
      .then(([mData, rData]: [ApiResponse<Metrics>, ApiResponse<Runner[]>]) => {
        if (mData.ok && mData.data) setMetrics(mData.data);
        if (rData.ok && rData.data) setRunners(rData.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-8 text-gray-400">Cargando dashboard...</div>;
  if (!metrics) return <div className="p-8 text-red-400">Error cargando metricas</div>;

  const onlineRunners = runners.filter((r) => r.status === "online");
  const failRate = metrics.runs.fail_rate_last_20;

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Tasks Ready" value={metrics.tasks.ready} color="text-blue-400" />
        <StatCard label="Tasks Running" value={metrics.tasks.running} color="text-yellow-400" />
        <StatCard label="Tasks Done" value={metrics.tasks.done} color="text-green-400" />
        <StatCard label="Tasks Failed" value={metrics.tasks.failed} color={metrics.tasks.failed > 0 ? "text-red-400" : "text-gray-400"} />
        <StatCard
          label="Runners"
          value={`${onlineRunners.length} / ${runners.length}`}
          color={onlineRunners.length > 0 ? "text-green-400" : "text-red-400"}
          sub={onlineRunners.length > 0 ? "online" : "todos offline"}
        />
        <StatCard
          label="Runs (24h)"
          value={metrics.runs.last_24h}
          sub={metrics.runs.fails_last_24h > 0 ? `${metrics.runs.fails_last_24h} failed` : undefined}
        />
        <StatCard
          label="Fail Rate"
          value={failRate != null ? `${(failRate * 100).toFixed(0)}%` : "-"}
          color={failRate != null && failRate > 0.2 ? "text-red-400" : "text-green-400"}
          sub="ultimos 20 runs"
        />
        <StatCard
          label="Avg Duration"
          value={formatAge(metrics.runs.avg_ready_to_done_seconds_last_20)}
          sub="ready → done"
        />
        <StatCard
          label="Backlog Age"
          value={formatAge(metrics.backlog.oldest_ready_age_seconds)}
          color={metrics.backlog.oldest_ready_age_seconds && metrics.backlog.oldest_ready_age_seconds > 86400 ? "text-yellow-400" : "text-gray-300"}
          sub="task mas vieja"
        />
        <StatCard
          label="Deduped"
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
