import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { DecisionsList } from "./DecisionsList";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeDirectiveStatus } from "../humanize";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  StatusPill,
  SectionBlock,
  AnimatedFadeIn,
} from "../ui2026";

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
  const [canPlan, setCanPlan] = useState(true);
  const [planBlockReason, setPlanBlockReason] = useState("");
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

  useEffect(() => {
    fetchDirectives();
    // Check preconditions
    apiFetch("/api/ops/gpt/preconditions")
      .then((r) => r.json())
      .then((data: ApiResponse<{ canPlan: boolean; reasons: string[] }>) => {
        if (data.ok && data.data) {
          setCanPlan(data.data.canPlan);
          if (!data.data.canPlan) {
            const reasonMap: Record<string, string> = {
              wizard_not_completed: "Completa la configuracion inicial primero",
              no_active_objectives: "Define un objetivo antes de generar planes",
              missing_required_requests: "Faltan datos de configuracion requeridos",
            };
            setPlanBlockReason(data.data.reasons.map((r: string) => reasonMap[r] ?? r).join(". "));
          }
        }
      })
      .catch(() => {});
  }, []);

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

  if (loading) return <PageContainer maxWidth="xl"><p className="text-slate-400">{isOp ? "Cargando planes..." : "Cargando directivas..."}</p></PageContainer>;
  if (error) return <PageContainer maxWidth="xl"><p className="text-red-400">{error}</p></PageContainer>;

  const gptButton = (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        <GlowButton
          onClick={runGpt}
          disabled={gptRunning || !canPlan}
          variant="primary"
          size="md"
        >
          {gptRunning ? "Generando..." : isOp ? "Generar nuevo plan (IA)" : "Run GPT"}
        </GlowButton>
        {gptMessage && (
          <span
            className={`text-sm ${gptMessage.type === "ok" ? "text-green-400" : "text-red-400"}`}
          >
            {gptMessage.text}
          </span>
        )}
      </div>
      {!canPlan && (
        <p className="text-xs text-yellow-400 mt-1">{planBlockReason}</p>
      )}
      {canPlan && isOp && !gptRunning && (
        <p className="text-xs text-slate-500 mt-1">Esto crea un plan que requiere tu aprobacion.</p>
      )}
    </div>
  );

  if (directives.length === 0) {
    return (
      <PageContainer maxWidth="xl">
        <h2 className="text-2xl font-bold mb-4 text-white">{isOp ? "Planes" : "Directivas"}</h2>
        {gptButton}
        <p className="text-slate-500">{isOp ? "Sin planes pendientes." : "Sin directivas. Usa el boton \"Run GPT\" para generar."}</p>
      </PageContainer>
    );
  }

  const selectedDir = selected ? directives.find((d) => d.id === selected) : null;
  const payload = selectedDir?.payload_json;

  return (
    <PageContainer maxWidth="xl">
      <h2 className="text-2xl font-bold mb-4">{isOp ? "Planes" : "Directivas"}</h2>
      {gptButton}
      <div className="flex gap-6">
        {/* Lista */}
        <div className="w-1/3 space-y-2">
          {directives.map((dir, idx) => (
            <AnimatedFadeIn key={dir.id} delay={idx * 40}>
              <GlassCard
                hover
                glow={selected === dir.id ? "primary" : "none"}
                onClick={() => setSelected(dir.id)}
                className="!p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill status={dir.status} label={isOp ? humanizeDirectiveStatus(dir.status) : undefined} size="sm" />
                  {!isOp && (
                    <>
                      <span className="font-medium text-sm">{dir.id}</span>
                      <span className="text-xs text-slate-500">{dir.source}</span>
                      {dir.payload_json && (
                        <span className="text-xs px-1 bg-elevated rounded text-slate-400">
                          {dir.directive_schema_version || "v1"}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-sm truncate text-slate-200">
                  {dir.payload_json?.objective ?? dir.title}
                </div>
              </GlassCard>
            </AnimatedFadeIn>
          ))}
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {selectedDir ? (
            <AnimatedFadeIn>
              <GlassCard className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold flex-1">
                    {payload ? payload.objective : selectedDir.title}
                  </h3>
                  <StatusPill
                    status={selectedDir.status}
                    label={isOp ? humanizeDirectiveStatus(selectedDir.status) : selectedDir.status}
                  />
                </div>

                {/* Context / Body */}
                {(payload?.context_summary || selectedDir.body) && (
                  <div className="text-sm text-slate-300 whitespace-pre-wrap">
                    {payload?.context_summary || selectedDir.body}
                  </div>
                )}

                {/* Estimated Impact */}
                {payload?.estimated_impact && (
                  <div className="text-sm bg-surface rounded-card p-3">
                    <span className="text-slate-400 font-semibold">{isOp ? "Impacto esperado: " : "Impacto estimado: "}</span>
                    <span className="text-slate-200">{payload.estimated_impact}</span>
                  </div>
                )}

                {/* Success Criteria */}
                {payload?.success_criteria && payload.success_criteria.length > 0 && (
                  <SectionBlock title={isOp ? "Criterios de exito" : "Criterios de exito"}>
                    <ul className="text-sm space-y-1">
                      {payload.success_criteria.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-green-500 mt-0.5">✓</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </SectionBlock>
                )}

                {/* Risks */}
                {payload?.risks && payload.risks.length > 0 && (
                  <SectionBlock title="Riesgos">
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
                  </SectionBlock>
                )}

                {/* Tasks to create */}
                {selectedDir.tasks_to_create.length > 0 && (
                  <SectionBlock title={isOp ? `Tareas a crear (${selectedDir.tasks_to_create.length})` : `Tasks a crear (${selectedDir.tasks_to_create.length})`}>
                    {isOp ? (
                      <ul className="text-sm space-y-1">
                        {selectedDir.tasks_to_create.map((t, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-slate-600 mt-0.5">-</span>
                            <span>{t.title}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-500 text-xs text-left">
                            <th className="pb-1">ID</th>
                            <th className="pb-1">Tipo</th>
                            <th className="pb-1">Titulo</th>
                            <th className="pb-1">Pri</th>
                            <th className="pb-1">Deps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDir.tasks_to_create.map((t, i) => (
                            <tr key={i} className="border-t border-[rgba(148,163,184,0.08)]">
                              <td className="py-1 font-mono text-xs text-slate-400">
                                {t.task_id || `auto-${i + 1}`}
                              </td>
                              <td className="py-1 text-xs text-slate-500">
                                {t.task_type || "-"}
                              </td>
                              <td className="py-1">{t.title}</td>
                              <td className="py-1 text-center">{t.priority ?? "-"}</td>
                              <td className="py-1 text-xs text-slate-500">
                                {t.depends_on?.join(", ") || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </SectionBlock>
                )}

                {/* Required requests - operator: prominent warning */}
                {payload?.required_requests && payload.required_requests.length > 0 && (
                  <div className={isOp ? "bg-yellow-900/30 border border-yellow-700 rounded-card p-3" : ""}>
                    <h4 className={`text-sm font-semibold mb-2 ${isOp ? "text-yellow-300" : "text-slate-400"}`}>
                      {isOp ? "Faltan datos para ejecutar" : "Requests requeridas"}
                    </h4>
                    <ul className="text-sm space-y-1">
                      {payload.required_requests.map((r) => (
                        <li key={r.request_id} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-yellow-400">{r.request_id}</span>
                          <span className="text-slate-300">{r.reason}</span>
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
                  <div className="text-sm text-slate-400 italic border-l-2 border-slate-600 pl-3">
                    {payload.apply_notes}
                  </div>
                )}

                {/* Acceptance criteria (legacy) */}
                {!payload && selectedDir.acceptance_criteria.length > 0 && (
                  <SectionBlock title="Criterios de aceptacion">
                    <ul className="text-sm space-y-1">
                      {selectedDir.acceptance_criteria.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-slate-600 mt-0.5">-</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </SectionBlock>
                )}

                {/* Botones PENDING_REVIEW */}
                {selectedDir.status === "PENDING_REVIEW" && (
                  <div className="flex gap-2 pt-4 border-t border-[rgba(148,163,184,0.08)]">
                    <GlowButton
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        if (isOp) {
                          // Operator: approve + apply in one click
                          await updateStatus(selectedDir.id, "APPROVED");
                          await applyDirective(selectedDir.id);
                        } else {
                          updateStatus(selectedDir.id, "APPROVED");
                        }
                      }}
                    >
                      {isOp ? "Aprobar y ejecutar" : "Aprobar"}
                    </GlowButton>
                    <GlowButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        const reason = prompt("Razon de rechazo:");
                        if (reason !== null) updateStatus(selectedDir.id, "REJECTED", reason);
                      }}
                    >
                      Rechazar
                    </GlowButton>
                  </div>
                )}

                {/* Boton APPROVED → Apply (solo modo tecnico) */}
                {selectedDir.status === "APPROVED" && !isOp && (
                  <div className="pt-4 border-t border-[rgba(148,163,184,0.08)]">
                    <div className="mb-3 text-sm text-yellow-400">
                      Aplicar creara {selectedDir.tasks_to_create.length} task(s) ejecutables.
                      {payload?.required_requests && payload.required_requests.length > 0 && (
                        <> Requiere: {payload.required_requests.map((r) => r.request_id).join(", ")}.</>
                      )}
                    </div>
                    <GlowButton
                      variant="primary"
                      size="sm"
                      onClick={() => applyDirective(selectedDir.id)}
                    >
                      Aplicar y Crear Tasks
                    </GlowButton>
                  </div>
                )}

                {/* Operator: APPROVED state — show confirmation, no extra button */}
                {selectedDir.status === "APPROVED" && isOp && (
                  <div className="pt-4 border-t border-[rgba(148,163,184,0.08)]">
                    <p className="text-sm text-green-400">Plan aprobado. Las tareas se estan creando.</p>
                  </div>
                )}

                {/* Decisions asociadas */}
                {!isOp && (
                  <div className="pt-4 border-t border-[rgba(148,163,184,0.08)]">
                    <h4 className="text-sm font-semibold mb-2 text-slate-400">Decisions</h4>
                    <DecisionsList filterDirectiveId={selectedDir.id} />
                  </div>
                )}

                {/* Meta */}
                <div className="text-xs text-slate-600 pt-2">
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
              </GlassCard>
            </AnimatedFadeIn>
          ) : (
            <div className="text-slate-500 text-sm">
              {isOp ? "Selecciona un plan para ver los detalles." : "Seleccionar una directiva para ver detalle."}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
