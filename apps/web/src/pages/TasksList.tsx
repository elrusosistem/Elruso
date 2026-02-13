import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  branch: string;
  depends_on: string[];
  blocked_by: string[];
  directive_id?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-blue-500",
  running: "bg-yellow-500",
  done: "bg-green-500",
  failed: "bg-red-500",
  blocked: "bg-gray-500",
};

const STATUSES = ["ready", "running", "done", "failed", "blocked"];

export function TasksList() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

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

  if (loading) return <div className="p-8 text-gray-400">Cargando tasks...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  // Agrupar por fase
  const phases = [...new Set(tasks.map((t) => t.phase))].sort((a, b) => a - b);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter("")}
            className={`text-xs px-3 py-1 rounded transition-colors ${
              statusFilter === "" ? "bg-white text-black" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            Todas
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded transition-colors capitalize ${
                statusFilter === s ? "bg-white text-black" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {phases.map((phase) => {
        const phaseTasks = tasks.filter((t) => t.phase === phase);
        if (phaseTasks.length === 0) return null;
        return (
          <div key={phase} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">
              Fase {phase}
            </h3>
            <div className="space-y-2">
              {phaseTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-gray-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{task.id}</span>
                      <span className="text-sm truncate">{task.title}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {task.blocked_by.length > 0 && (
                        <span className="text-red-400">
                          Bloqueado por: {task.blocked_by.join(", ")}
                        </span>
                      )}
                      {task.depends_on.length > 0 && (
                        <span className="ml-2">Depende: {task.depends_on.join(", ")}</span>
                      )}
                      {task.directive_id && (
                        <span className="ml-2 text-blue-400">{task.directive_id}</span>
                      )}
                    </div>
                  </div>
                  <select
                    value={task.status}
                    onChange={(e) => updateStatus(task.id, e.target.value)}
                    className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
