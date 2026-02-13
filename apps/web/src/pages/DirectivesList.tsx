import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { DecisionsList } from "./DecisionsList";

interface Risk {
  id: string;
  text: string;
  severity: "low" | "med" | "high";
}

interface TaskToCreate {
  task_id?: string;
  title: string;
  priority?: number;
  depends_on?: string[];
  acceptance_criteria?: string[];
  description?: string;
  // Legacy fields
  phase?: number;
}

interface RequiredRequest {
  request_id: string;
  reason: string;
}

interface PayloadV1 {
  version: "directive_v1";
  objective: string;
  context_summary?: string;
  risks?: Risk[];
  tasks_to_create: TaskToCreate[];
  required_requests?: RequiredRequest[];
  apply_notes?: string;
}

interface Directive {
  id: string;
  created_at: string;
  source: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED";
  title: string;
  body: string;
  acceptance_criteria: string[];
  tasks_to_create: TaskToCreate[];
  payload_json: PayloadV1 | null;
  payload_hash: string | null;
  applied_at: string | null;
  rejection_reason: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-yellow-500",
  APPROVED: "bg-blue-500",
  APPLIED: "bg-green-500",
  REJECTED: "bg-red-500",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-green-400",
  med: "text-yellow-400",
  high: "text-red-400",
};

export function DirectivesList() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gptRunning, setGptRunning] = useState(false);
  const [gptMessage, setGptMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const fetchDirectives = () => {
    fetch("/api/ops/directives")
      .then((r) => r.json())
      .then((data: ApiResponse<Directive[]>) => {
        if (data.ok && data.data) setDirectives(data.data);
        else setError(data.error ?? "Error cargando directives");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDirectives(); }, []);

  const runGpt = async () => {
    // Check if system is paused
    try {
      const sysRes = await fetch("/api/ops/system/status");
      const sysData: ApiResponse<{ paused: boolean }> = await sysRes.json();
      if (sysData.ok && sysData.data?.paused) {
        const ok = confirm("El sistema esta pausado. ¿Generar directivas de todas formas?");
        if (!ok) return;
      }
    } catch {
      // Can't check — proceed anyway
    }

    setGptRunning(true);
    setGptMessage(null);
    try {
      const res = await fetch("/api/ops/gpt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        const count = data.data?.directives_created ?? data.data?.length ?? "?";
        setGptMessage({ type: "ok", text: `GPT completo — ${count} directiva(s) creada(s)` });
        fetchDirectives();
      } else {
        const msg = res.status === 404
          ? "Endpoint /ops/gpt/run no disponible en API"
          : data.error ?? `Error ${res.status}`;
        setGptMessage({ type: "error", text: msg });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de red";
      setGptMessage({ type: "error", text: msg });
    } finally {
      setGptRunning(false);
    }
  };

  const updateStatus = async (id: string, status: string, rejection_reason?: string) => {
    await fetch(`/api/ops/directives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejection_reason }),
    });
    fetchDirectives();
  };

  const applyDirective = async (id: string) => {
    const response = await fetch(`/api/ops/directives/${id}/apply`, { method: "POST" });
    const data = await response.json();
    if (data.ok) {
      const msg = data.data.idempotent
        ? "Directiva ya estaba aplicada (no-op)"
        : `Directiva aplicada: ${data.data.tasks_created} tasks creadas`;
      alert(msg);
      fetchDirectives();
    } else {
      alert(`Error: ${data.error}`);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando directivas...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  const gptButton = (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        <button
          onClick={runGpt}
          disabled={gptRunning}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            gptRunning
              ? "bg-gray-600 cursor-not-allowed text-gray-400"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {gptRunning ? "Generando..." : "Run GPT"}
        </button>
        {gptMessage && (
          <span
            className={`text-sm ${gptMessage.type === "ok" ? "text-green-400" : "text-red-400"}`}
          >
            {gptMessage.text}
          </span>
        )}
      </div>
    </div>
  );

  if (directives.length === 0) {
    return (
      <div className="p-8 text-gray-500">
        <h2 className="text-2xl font-bold mb-4 text-white">Directivas</h2>
        {gptButton}
        <p>Sin directivas. Usa el boton "Run GPT" para generar.</p>
      </div>
    );
  }

  const selectedDir = selected ? directives.find((d) => d.id === selected) : null;
  // Usar payload_json si existe (directive_v1), sino campos legacy
  const payload = selectedDir?.payload_json;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Directivas</h2>
      {gptButton}
      <div className="flex gap-6">
        {/* Lista */}
        <div className="w-1/3 space-y-2">
          {directives.map((dir) => (
            <button
              key={dir.id}
              onClick={() => setSelected(dir.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selected === dir.id ? "bg-gray-700" : "bg-gray-800 hover:bg-gray-750"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[dir.status]}`} />
                <span className="font-medium text-sm">{dir.id}</span>
                <span className="text-xs text-gray-500">{dir.source}</span>
                {dir.payload_json && (
                  <span className="text-xs px-1 bg-gray-700 rounded text-gray-400">v1</span>
                )}
              </div>
              <div className="text-sm truncate">{dir.title}</div>
            </button>
          ))}
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {selectedDir ? (
            <div className="bg-gray-800 rounded-lg p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[selectedDir.status]}`} />
                <h3 className="text-lg font-semibold flex-1">
                  {payload ? payload.objective : selectedDir.title}
                </h3>
                <span className="text-xs px-2 py-0.5 bg-gray-700 rounded uppercase">
                  {selectedDir.status}
                </span>
              </div>

              {/* Context / Body */}
              {(payload?.context_summary || selectedDir.body) && (
                <div className="text-sm text-gray-300 whitespace-pre-wrap">
                  {payload?.context_summary || selectedDir.body}
                </div>
              )}

              {/* Risks */}
              {payload?.risks && payload.risks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Riesgos</h4>
                  <div className="space-y-1">
                    {payload.risks.map((r) => (
                      <div key={r.id} className="flex items-start gap-2 text-sm">
                        <span className={`font-mono text-xs mt-0.5 ${SEVERITY_COLORS[r.severity]}`}>
                          [{r.severity.toUpperCase()}]
                        </span>
                        <span>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks to create */}
              {selectedDir.tasks_to_create.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">
                    Tasks a crear ({selectedDir.tasks_to_create.length})
                  </h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs text-left">
                        <th className="pb-1">ID</th>
                        <th className="pb-1">Titulo</th>
                        <th className="pb-1">Prioridad</th>
                        <th className="pb-1">Deps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDir.tasks_to_create.map((t, i) => (
                        <tr key={i} className="border-t border-gray-700">
                          <td className="py-1 font-mono text-xs text-gray-400">
                            {t.task_id || `auto-${i + 1}`}
                          </td>
                          <td className="py-1">{t.title}</td>
                          <td className="py-1 text-center">{t.priority ?? t.phase ?? "-"}</td>
                          <td className="py-1 text-xs text-gray-500">
                            {t.depends_on?.join(", ") || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Required requests */}
              {payload?.required_requests && payload.required_requests.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Requests requeridas</h4>
                  <ul className="text-sm space-y-1">
                    {payload.required_requests.map((r) => (
                      <li key={r.request_id} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-yellow-400">{r.request_id}</span>
                        <span className="text-gray-300">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Apply notes */}
              {payload?.apply_notes && (
                <div className="text-sm text-gray-400 italic border-l-2 border-gray-600 pl-3">
                  {payload.apply_notes}
                </div>
              )}

              {/* Acceptance criteria (legacy) */}
              {!payload && selectedDir.acceptance_criteria.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Criterios de aceptacion</h4>
                  <ul className="text-sm space-y-1">
                    {selectedDir.acceptance_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-gray-600 mt-0.5">-</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Botones PENDING_REVIEW */}
              {selectedDir.status === "PENDING_REVIEW" && (
                <div className="flex gap-2 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => updateStatus(selectedDir.id, "APPROVED")}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm transition-colors"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Razon de rechazo:");
                      if (reason !== null) updateStatus(selectedDir.id, "REJECTED", reason);
                    }}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              )}

              {/* Botón APPROVED → Apply */}
              {selectedDir.status === "APPROVED" && (
                <div className="pt-4 border-t border-gray-700">
                  <div className="mb-3 text-sm text-yellow-400">
                    Aplicar creara {selectedDir.tasks_to_create.length} task(s) ejecutables.
                  </div>
                  <button
                    onClick={() => applyDirective(selectedDir.id)}
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-sm transition-colors"
                  >
                    Aplicar y Crear Tasks
                  </button>
                </div>
              )}

              {/* Decisions asociadas */}
              <div className="pt-4 border-t border-gray-700">
                <h4 className="text-sm font-semibold mb-2 text-gray-400">Decisions</h4>
                <DecisionsList filterDirectiveId={selectedDir.id} />
              </div>

              {/* Meta */}
              <div className="text-xs text-gray-600 pt-2">
                Creada: {new Date(selectedDir.created_at).toLocaleString("es-AR")}
                {selectedDir.applied_at && (
                  <> | Aplicada: {new Date(selectedDir.applied_at).toLocaleString("es-AR")}</>
                )}
                {selectedDir.rejection_reason && (
                  <> | Razon: {selectedDir.rejection_reason}</>
                )}
                {selectedDir.payload_hash && (
                  <> | Hash: {selectedDir.payload_hash.substring(0, 12)}...</>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">Seleccionar una directiva para ver detalle.</div>
          )}
        </div>
      </div>
    </div>
  );
}
