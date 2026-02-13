import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeTaskStatus, formatNextRun, isOperatorVisible } from "../humanize";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  branch: string;
  depends_on: string[];
  blocked_by: string[];
  directive_id?: string;
  claimed_by?: string;
  claimed_at?: string;
  attempts?: number;
  max_attempts?: number;
  next_run_at?: string;
  last_error?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-blue-500",
  running: "bg-yellow-500",
  done: "bg-green-500",
  failed: "bg-red-500",
  blocked: "bg-gray-500",
};

const STATUSES = ["ready", "running", "done", "failed", "blocked"];

const STATUS_LABELS_OP: Record<string, string> = {
  "": "Todas",
  ready: "Pendientes",
  running: "En curso",
  done: "Listas",
  failed: "Fallaron",
  blocked: "Necesitan configuracion",
};

export function TasksList() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchTasks = (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    apiFetch(`/api/ops/tasks${qs}`)
      .then((r) => r.json())
      .then((data: ApiResponse<TaskEntry[]>) => {
        if (data.ok && data.data) setTasks(data.data);
        else setError(data.error ?? "Error cargando tasks");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(statusFilter || undefined); }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/api/ops/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks(statusFilter || undefined);
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando tareas...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  // In operator mode, filter out test/done/deduped tasks
  const visibleTasks = isOp ? tasks.filter((t) => isOperatorVisible(t)) : tasks;
  const phases = [...new Set(visibleTasks.map((t) => t.phase))].sort((a, b) => a - b);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">{isOp ? "Tareas" : "Tasks"}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter("")}
            className={`text-xs px-3 py-1 rounded transition-colors ${
              statusFilter === "" ? "bg-white text-black" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            {isOp ? "Todas" : "Todas"}
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                statusFilter === s ? "bg-white text-black" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {isOp ? STATUS_LABELS_OP[s] ?? s : s}
            </button>
          ))}
        </div>
      </div>

      {phases.map((phase) => {
        const phaseTasks = visibleTasks.filter((t) => t.phase === phase);
        if (phaseTasks.length === 0) return null;
        return (
          <div key={phase} className="mb-6">
            {!isOp && (
              <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">
                Fase {phase}
              </h3>
            )}
            <div className="space-y-2">
              {phaseTasks.map((task) => {
                const hStatus = humanizeTaskStatus(task.status);
                const nextRun = formatNextRun(task.next_run_at);
                const attempts = task.attempts ?? 0;
                const maxAttempts = task.max_attempts ?? 3;
                const isRetrying = task.status === "failed" && attempts > 0 && attempts < maxAttempts;

                return (
                  <div key={task.id} className="p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-gray-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!isOp && <span className="font-mono text-xs text-gray-500">{task.id}</span>}
                          <span className="text-sm truncate">{task.title}</span>
                          {isOp ? (
                            <>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${hStatus.tone} bg-gray-700/50`}>
                                {isRetrying ? "Reintentando" : hStatus.label}
                              </span>
                              {isRetrying && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400">
                                  Reintentos: {attempts}/{maxAttempts}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {task.status === "running" && task.claimed_by && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-400 uppercase font-semibold">
                                  Claimed
                                </span>
                              )}
                              {attempts > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                                  {attempts}/{maxAttempts}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {!isOp && (
                        <select
                          value={task.status}
                          onChange={(e) => updateStatus(task.id, e.target.value)}
                          className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 ml-5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {isOp ? (
                        <>
                          {task.status === "blocked" && (
                            <a href="#/requests" className="text-red-400 hover:underline">
                              Ir a Configuracion
                            </a>
                          )}
                          {task.blocked_by.length > 0 && task.status !== "blocked" && (
                            <span className="text-red-400">Requiere accion</span>
                          )}
                          {isRetrying && nextRun && (
                            <span className="text-yellow-400">{nextRun}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {task.depends_on.length > 0 && (
                            <span>Deps: {task.depends_on.join(", ")}</span>
                          )}
                          {task.blocked_by.length > 0 && (
                            <span className="text-red-400">Blocked: {task.blocked_by.join(", ")}</span>
                          )}
                          {task.claimed_by && (
                            <span>Runner: {task.claimed_by}</span>
                          )}
                          {task.claimed_at && (
                            <span>Claimed: {new Date(task.claimed_at).toLocaleString("es-AR")}</span>
                          )}
                          {task.next_run_at && (
                            <span className="text-yellow-400">Next: {new Date(task.next_run_at).toLocaleString("es-AR")}</span>
                          )}
                          {task.last_error && (
                            <span className="text-red-400 truncate max-w-xs" title={task.last_error}>
                              Error: {task.last_error}
                            </span>
                          )}
                          {task.directive_id && (
                            <span className="text-blue-400">{task.directive_id}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
