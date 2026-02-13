import { useEffect, useState } from "react";
import type { ApiResponse, Objective } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  active: "bg-green-500",
  paused: "bg-yellow-500",
  done: "bg-blue-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  done: "Completado",
};

export function ObjectivesList() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchObjectives = () => {
    apiFetch("/api/ops/objectives")
      .then((r) => r.json())
      .then((data: ApiResponse<Objective[]>) => {
        if (data.ok && data.data) setObjectives(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchObjectives();
  }, []);

  const activate = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}/activate`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo activado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  const pause = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}/pause`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo pausado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  const complete = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo completado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando objetivos...</div>;

  // Group by status: active first, then draft, paused, done
  const order = ["active", "draft", "paused", "done"];
  const sorted = [...objectives].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );

  const activeCount = objectives.filter((o) => o.status === "active").length;

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold mb-2">Objetivos</h2>
      <p className="text-sm text-gray-400 mb-6">
        {isOp
          ? "Las metas de tu negocio. El sistema genera planes alineados a estos objetivos."
          : "Objectives scope GPT planning. Active objectives are included in the compose prompt."}
      </p>

      {message && (
        <div
          className={`mb-4 text-sm ${message.type === "ok" ? "text-green-400" : "text-red-400"}`}
        >
          {message.text}
        </div>
      )}

      {objectives.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            {isOp
              ? "No hay objetivos definidos. Completa el wizard para crear tu primer objetivo."
              : "No objectives. Complete the strategy wizard to create one."}
          </p>
          <a
            href="#/strategy-wizard"
            className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            Definir estrategia
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((obj) => (
            <div
              key={obj.id}
              className="bg-gray-800 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[obj.status]}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-white truncate">
                      {obj.title}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        obj.status === "active"
                          ? "bg-green-900 text-green-400"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {STATUS_LABELS[obj.status] ?? obj.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">
                      {obj.profile}
                    </span>
                  </div>
                  {obj.description && (
                    <p className="text-xs text-gray-400 mb-2">
                      {obj.description}
                    </p>
                  )}
                  {!isOp && (
                    <div className="text-xs text-gray-600">
                      ID: {obj.id} | P{obj.priority} |{" "}
                      {new Date(obj.created_at).toLocaleString("es-AR")}
                      {obj.last_reviewed_at && (
                        <> | Revisado: {new Date(obj.last_reviewed_at).toLocaleString("es-AR")}</>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {obj.status === "draft" && (
                    <button
                      onClick={() => activate(obj.id)}
                      className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded transition-colors"
                    >
                      Activar
                    </button>
                  )}
                  {obj.status === "active" && (
                    <>
                      <button
                        onClick={() => pause(obj.id)}
                        className="text-xs px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded transition-colors"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => complete(obj.id)}
                        className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded transition-colors"
                      >
                        Completar
                      </button>
                    </>
                  )}
                  {obj.status === "paused" && (
                    <button
                      onClick={() => activate(obj.id)}
                      className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded transition-colors"
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeCount > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          {activeCount} objetivo(s) activo(s) — el sistema genera planes alineados a estos.
        </div>
      )}
    </div>
  );
}
