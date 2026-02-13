import { useEffect, useState } from "react";
import type { ApiResponse, RunLog } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeRunStatus, formatTimeAgo } from "../humanize";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500",
  done: "bg-green-500",
  failed: "bg-red-500",
  blocked: "bg-yellow-500",
  deduped: "bg-gray-600",
};

export function RunsList() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    apiFetch("/api/runs")
      .then((r) => r.json())
      .then((data: ApiResponse<RunLog[]>) => {
        if (data.ok && data.data) {
          setRuns(data.data);
        } else {
          setError(data.error ?? "Error cargando runs");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-400">Cargando ejecuciones...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-8 text-gray-500">
        No hay ejecuciones registradas todavia.
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Ejecuciones</h2>
      <div className="space-y-2">
        {runs.map((run) => (
          <a
            key={run.id}
            href={`#/runs/${run.id}`}
            className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[run.status] ?? "bg-gray-500"}`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{run.task_id}</div>
              <div className="text-sm text-gray-400">
                {run.branch && !isOp && <span className="mr-3">{run.branch}</span>}
                {isOp
                  ? formatTimeAgo(run.started_at)
                  : new Date(run.started_at).toLocaleString("es-AR")}
              </div>
            </div>
            {run.artifact_path && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-800 text-purple-200" title={isOp ? "Tiene cambios registrados" : "Patch forense disponible"}>
                {isOp ? "Cambios" : "PATCH"}
              </span>
            )}
            <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 uppercase">
              {isOp ? humanizeRunStatus(run.status) : run.status}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
