import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { DecisionsList } from "./DecisionsList";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeDirectiveStatus } from "../humanize";

interface Risk {
  id: string;
  text: string;
  severity: "low" | "med" | "high";
}

interface TaskToCreate {
  task_id?: string;
  task_type?: string;
  title: string;
  steps?: string[];
  priority?: number;
  phase?: number;
  depends_on?: string[];
  acceptance_criteria?: string[];
  description?: string;
  params?: Record<string, unknown>;
}

interface RequiredRequest {
  request_id: string;
  reason: string;
}

interface PayloadV1 {
  version: "directive_v1";
  directive_schema_version?: string;
  objective: string;
  context_summary?: string;
  risks?: Risk[];
  tasks_to_create: TaskToCreate[];
  required_requests?: RequiredRequest[];
  success_criteria?: string[];
  estimated_impact?: string;
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
  directive_schema_version?: string;
  applied_at: string | null;
  rejection_reason: string | null;
}

interface ApplyResult {
  directive_id: string;
  tasks_created: number;
  tasks_skipped: number;
  blocked_by_requests: boolean;
  missing_requests: string[];
  idempotent: boolean;
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

const SEVERITY_LABELS: Record<string, string> = {
  low: "Bajo",
  med: "Medio",
  high: "Alto",
};

export function DirectivesList() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gptRunning, setGptRunning] = useState(false);
  const [gptMessage, setGptMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchDirectives = () => {
    apiFetch("/api/ops/directives")
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
    try {
      const sysRes = await apiFetch("/api/ops/system/status");
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
      const res = await apiFetch("/api/ops/gpt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        const d = data.data;
        const parts: string[] = [];
        parts.push(`${d.directives_created} creada(s)`);
        if (d.directives_skipped > 0) parts.push(`${d.directives_skipped} duplicada(s)`);
        if (d.validation_errors?.length > 0) parts.push(`${d.validation_errors.length} error(es) validacion`);
        setGptMessage({ type: "ok", text: isOp ? `Plan generado — ${parts.join(", ")}` : `GPT completo — ${parts.join(", ")}` });
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
    await apiFetch(`/api/ops/directives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejection_reason }),
    });
    fetchDirectives();
  };

  const applyDirective = async (id: string) => {
    const response = await apiFetch(`/api/ops/directives/${id}/apply`, { method: "POST" });
    const data: ApiResponse<ApplyResult> = await response.json();
    if (data.ok && data.data) {
      const r = data.data;
      if (r.idempotent) {
        alert(isOp ? "Este plan ya fue aplicado anteriormente." : "Directiva ya estaba aplicada (no-op)");
      } else if (r.blocked_by_requests) {
        alert(isOp
          ? `No se puede aplicar: faltan datos por configurar (${r.missing_requests.join(", ")})`
          : `Directiva bloqueada: faltan requests ${r.missing_requests.join(", ")}`);
      } else {
        const parts: string[] = [`${r.tasks_created} tarea(s) creada(s)`];
        if (r.tasks_skipped > 0) parts.push(`${r.tasks_skipped} duplicada(s)`);
        alert(isOp ? `Plan aplicado: ${parts.join(", ")}` : `Directiva aplicada: ${parts.join(", ")}`);
      }
      fetchDirectives();
    } else {
      alert(`Error: ${data.error}`);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">{isOp ? "Cargando planes..." : "Cargando directivas..."}</div>;
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
          {gptRunning ? "Generando..." : isOp ? "Generar nuevo plan (IA)" : "Run GPT"}
        </button>
        {gptMessage && (
          <span
            className={`text-sm ${gptMessage.type === "ok" ? "text-green-400" : "text-red-400"}`}
          >
            {gptMessage.text}
          </span>
        )}
      </div>
      {isOp && !gptRunning && (
        <p className="text-xs text-gray-500 mt-1">Esto crea un plan que requiere tu aprobacion.</p>
      )}
    </div>
  );

  if (directives.length === 0) {
    return (
      <div className="p-8 text-gray-500">
        <h2 className="text-2xl font-bold mb-4 text-white">{isOp ? "Planes" : "Directivas"}</h2>
        {gptButton}
        <p>{isOp ? "Sin planes pendientes." : "Sin directivas. Usa el boton \"Run GPT\" para generar."}</p>
      </div>
    );
  }

  const selectedDir = selected ? directives.find((d) => d.id === selected) : null;
  const payload = selectedDir?.payload_json;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">{isOp ? "Planes" : "Directivas"}</h2>
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
                {isOp ? (
                  <span className="text-xs text-gray-400">
                    {humanizeDirectiveStatus(dir.status)}
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-sm">{dir.id}</span>
                    <span className="text-xs text-gray-500">{dir.source}</span>
                    {dir.payload_json && (
                      <span className="text-xs px-1 bg-gray-700 rounded text-gray-400">
                        {dir.directive_schema_version || "v1"}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-sm truncate">
                {dir.payload_json?.objective ?? dir.title}
              </div>
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
                  {isOp ? humanizeDirectiveStatus(selectedDir.status) : selectedDir.status}
                </span>
              </div>

              {/* Context / Body */}
              {(payload?.context_summary || selectedDir.body) && (
                <div className="text-sm text-gray-300 whitespace-pre-wrap">
                  {payload?.context_summary || selectedDir.body}
                </div>
              )}

              {/* Estimated Impact */}
              {payload?.estimated_impact && (
                <div className="text-sm bg-gray-900 rounded p-3">
                  <span className="text-gray-400 font-semibold">{isOp ? "Impacto esperado: " : "Impacto estimado: "}</span>
                  <span className="text-gray-200">{payload.estimated_impact}</span>
                </div>
              )}

              {/* Success Criteria */}
              {payload?.success_criteria && payload.success_criteria.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">
                    {isOp ? "Criterios de exito" : "Criterios de exito"}
                  </h4>
                  <ul className="text-sm space-y-1">
                    {payload.success_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
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
                          [{isOp ? SEVERITY_LABELS[r.severity] ?? r.severity.toUpperCase() : r.severity.toUpperCase()}]
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
                    {isOp ? `Tareas a crear (${selectedDir.tasks_to_create.length})` : `Tasks a crear (${selectedDir.tasks_to_create.length})`}
                  </h4>
                  {isOp ? (
                    <ul className="text-sm space-y-1">
                      {selectedDir.tasks_to_create.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-gray-600 mt-0.5">-</span>
                          <span>{t.title}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs text-left">
                          <th className="pb-1">ID</th>
                          <th className="pb-1">Tipo</th>
                          <th className="pb-1">Titulo</th>
                          <th className="pb-1">Pri</th>
                          <th className="pb-1">Deps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDir.tasks_to_create.map((t, i) => (
                          <tr key={i} className="border-t border-gray-700">
                            <td className="py-1 font-mono text-xs text-gray-400">
                              {t.task_id || `auto-${i + 1}`}
                            </td>
                            <td className="py-1 text-xs text-gray-500">
                              {t.task_type || "-"}
                            </td>
                            <td className="py-1">{t.title}</td>
                            <td className="py-1 text-center">{t.priority ?? "-"}</td>
                            <td className="py-1 text-xs text-gray-500">
                              {t.depends_on?.join(", ") || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Required requests - operator: prominent warning */}
              {payload?.required_requests && payload.required_requests.length > 0 && (
                <div className={isOp ? "bg-yellow-900/30 border border-yellow-700 rounded p-3" : ""}>
                  <h4 className={`text-sm font-semibold mb-2 ${isOp ? "text-yellow-300" : "text-gray-400"}`}>
                    {isOp ? "Faltan datos para ejecutar" : "Requests requeridas"}
                  </h4>
                  <ul className="text-sm space-y-1">
                    {payload.required_requests.map((r) => (
                      <li key={r.request_id} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-yellow-400">{r.request_id}</span>
                        <span className="text-gray-300">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {isOp && (
                    <a href="#/requests" className="text-xs text-blue-400 hover:underline mt-2 inline-block">
                      Ir a Configuracion →
                    </a>
                  )}
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
                    {isOp ? "Aprobar plan" : "Aprobar"}
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
                    {isOp
                      ? `Aplicar creara ${selectedDir.tasks_to_create.length} tarea(s).`
                      : `Aplicar creara ${selectedDir.tasks_to_create.length} task(s) ejecutables.`}
                    {payload?.required_requests && payload.required_requests.length > 0 && (
                      <> {isOp ? "Requiere datos:" : "Requiere:"} {payload.required_requests.map((r) => r.request_id).join(", ")}.</>
                    )}
                  </div>
                  <button
                    onClick={() => applyDirective(selectedDir.id)}
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-sm transition-colors"
                  >
                    {isOp ? "Aplicar plan" : "Aplicar y Crear Tasks"}
                  </button>
                </div>
              )}

              {/* Decisions asociadas */}
              {!isOp && (
                <div className="pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Decisions</h4>
                  <DecisionsList filterDirectiveId={selectedDir.id} />
                </div>
              )}

              {/* Meta */}
              <div className="text-xs text-gray-600 pt-2">
                {isOp ? (
                  <>
                    Creado: {new Date(selectedDir.created_at).toLocaleString("es-AR")}
                    {selectedDir.applied_at && (
                      <> | Aplicado: {new Date(selectedDir.applied_at).toLocaleString("es-AR")}</>
                    )}
                    {selectedDir.rejection_reason && (
                      <> | Motivo: {selectedDir.rejection_reason}</>
                    )}
                  </>
                ) : (
                  <>
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
                    {selectedDir.directive_schema_version && (
                      <> | Schema: {selectedDir.directive_schema_version}</>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">
              {isOp ? "Selecciona un plan para ver los detalles." : "Seleccionar una directiva para ver detalle."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
