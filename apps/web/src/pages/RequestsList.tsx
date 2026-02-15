import { useEffect, useState } from "react";
import type { ApiResponse, OpsRequest, RequestStatus } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  StatusPill,
  SectionBlock,
  AnimatedFadeIn,
} from "../ui2026";

interface ValueInputs {
  [requestId: string]: { [scope: string]: string };
}

interface ValueStatus {
  [requestId: string]: boolean;
}

export function RequestsList() {
  const [requests, setRequests] = useState<OpsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valueInputs, setValueInputs] = useState<ValueInputs>({});
  const [valueStatuses, setValueStatuses] = useState<ValueStatus>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, { ok: boolean; message: string } | null>
  >({});
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchRequests = () => {
    apiFetch("/api/ops/requests")
      .then((r) => r.json())
      .then((data: ApiResponse<OpsRequest[]>) => {
        if (data.ok && data.data) {
          setRequests(data.data);
          data.data.forEach((req) => {
            apiFetch(`/api/ops/requests/${req.id}/value/status`)
              .then((r) => r.json())
              .then((statusData: ApiResponse<{ has_value: boolean }>) => {
                if (statusData.ok && statusData.data) {
                  setValueStatuses((prev) => ({ ...prev, [req.id]: statusData.data!.has_value }));
                }
              })
              .catch(() => {});
          });
        } else {
          setError(data.error ?? "Error cargando requests");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRequests(); }, []);

  const updateStatus = async (id: string, status: RequestStatus) => {
    const res = await apiFetch(`/api/ops/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data: ApiResponse<OpsRequest> = await res.json();
    if (data.ok) fetchRequests();
  };

  const handleInputChange = (requestId: string, scope: string, value: string) => {
    setValueInputs((prev) => ({
      ...prev,
      [requestId]: { ...(prev[requestId] ?? {}), [scope]: value },
    }));
  };

  const saveValues = async (req: OpsRequest) => {
    const values = valueInputs[req.id];
    if (!values || Object.values(values).every((v) => !v.trim())) {
      setMessage("Completar al menos un valor");
      return;
    }

    const cleanValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) cleanValues[k] = v.trim();
    }

    setSaving(req.id);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/ops/requests/${req.id}/value`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: cleanValues }),
      });
      const data: ApiResponse<{ saved: boolean; env_runtime: string }> = await res.json();
      if (data.ok) {
        setMessage(isOp ? "Guardado correctamente." : "Guardado. .env.runtime generado. Reiniciar API para aplicar.");
        setValueInputs((prev) => ({ ...prev, [req.id]: {} }));
        fetchRequests();
      } else {
        setMessage(data.error ?? "Error guardando");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const validateRequest = async (reqId: string) => {
    setValidating(reqId);
    setValidationResults((prev) => ({ ...prev, [reqId]: null }));
    try {
      const res = await apiFetch(`/api/ops/requests/${reqId}/validate`, {
        method: "POST",
      });
      const data: ApiResponse<{ ok: boolean; message: string }> = await res.json();
      if (data.ok && data.data) {
        setValidationResults((prev) => ({ ...prev, [reqId]: data.data! }));
      } else {
        setValidationResults((prev) => ({
          ...prev,
          [reqId]: { ok: false, message: data.error ?? "Error validando" },
        }));
      }
    } catch (e) {
      setValidationResults((prev) => ({
        ...prev,
        [reqId]: { ok: false, message: (e as Error).message },
      }));
    } finally {
      setValidating(null);
    }
  };

  if (loading) return <PageContainer maxWidth="lg"><p className="text-slate-400">{isOp ? "Cargando configuracion..." : "Cargando requests..."}</p></PageContainer>;
  if (error) return <PageContainer maxWidth="lg"><p className="text-red-400">{error}</p></PageContainer>;

  // Split into pending and provided for operator mode
  const requiredForPlanning = requests.filter(
    (r) => r.required_for_planning && r.status !== "PROVIDED",
  );
  const pending = requests.filter(
    (r) =>
      (r.status === "WAITING" || r.status === ("MISSING" as string)) &&
      !r.required_for_planning,
  );
  const provided = requests.filter((r) => r.status === "PROVIDED");
  const rejected = requests.filter((r) => r.status === "REJECTED");

  if (isOp) {
    return (
      <PageContainer maxWidth="lg">
        <h2 className="text-2xl font-bold mb-2">Configuracion</h2>
        <p className="text-sm text-slate-400 mb-6">
          Datos que el sistema necesita para funcionar. Los valores se guardan de forma segura.
        </p>

        {message && (
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-card text-sm text-blue-200">
            {message}
          </div>
        )}

        {/* Required for planning section */}
        {requiredForPlanning.length > 0 && (
          <SectionBlock title="Requeridos para generar plan" subtitle="Sin estos datos el sistema no puede generar planes.">
            <div className="space-y-4">
              {requiredForPlanning.map((req, idx) => (
                <AnimatedFadeIn key={req.id} delay={idx * 60}>
                  <GlassCard className="border-l-4 border-orange-500 !rounded-l-none">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill status={req.status} size="sm" />
                      <span className="font-medium">{req.purpose}</span>
                      <span className="text-xs px-2 py-0.5 bg-elevated rounded">{req.service}</span>
                      <span className="text-xs px-2 py-0.5 bg-orange-900 text-orange-300 rounded">Requerido</span>
                    </div>
                    {req.type !== "tool" ? (
                      <div className="mt-3">
                        <div className="space-y-2">
                          {req.scopes.map((scope) => (
                            <div key={scope} className="flex items-center gap-2">
                              <label className="text-xs text-slate-400 w-48 flex-shrink-0">{scope}</label>
                              <input
                                type="password"
                                placeholder={`Pegar ${scope}...`}
                                value={valueInputs[req.id]?.[scope] ?? ""}
                                onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                                className="flex-1 text-xs bg-elevated border border-[rgba(148,163,184,0.08)] rounded-card px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <GlowButton
                            onClick={() => saveValues(req)}
                            disabled={saving === req.id}
                            variant="primary"
                            size="sm"
                          >
                            {saving === req.id ? "Guardando..." : "Configurar"}
                          </GlowButton>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <GlowButton
                          onClick={() => updateStatus(req.id, "PROVIDED")}
                          variant="primary"
                          size="sm"
                        >
                          Marcar como instalado
                        </GlowButton>
                      </div>
                    )}
                  </GlassCard>
                </AnimatedFadeIn>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* Pending / Missing section */}
        {pending.length > 0 && (
          <SectionBlock title="Faltan configurar" subtitle="Sin esto el sistema no puede avanzar.">
            <div className="space-y-4">
              {pending.map((req, idx) => (
                <AnimatedFadeIn key={req.id} delay={idx * 60}>
                  <GlassCard className="border-l-4 border-yellow-500 !rounded-l-none">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill status={req.status} size="sm" />
                      <span className="font-medium">{req.purpose}</span>
                      <span className="text-xs px-2 py-0.5 bg-elevated rounded">{req.service}</span>
                    </div>

                    {req.type !== "tool" ? (
                      <div className="mt-3">
                        <div className="space-y-2">
                          {req.scopes.map((scope) => (
                            <div key={scope} className="flex items-center gap-2">
                              <label className="text-xs text-slate-400 w-48 flex-shrink-0">{scope}</label>
                              <input
                                type="password"
                                placeholder={`Pegar ${scope}...`}
                                value={valueInputs[req.id]?.[scope] ?? ""}
                                onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                                className="flex-1 text-xs bg-elevated border border-[rgba(148,163,184,0.08)] rounded-card px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <GlowButton
                            onClick={() => saveValues(req)}
                            disabled={saving === req.id}
                            variant="primary"
                            size="sm"
                          >
                            {saving === req.id ? "Guardando..." : "Configurar"}
                          </GlowButton>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <p className="text-xs text-slate-400 mb-2">
                          Herramienta que debe instalarse manualmente.
                        </p>
                        <GlowButton
                          onClick={() => updateStatus(req.id, "PROVIDED")}
                          variant="primary"
                          size="sm"
                        >
                          Marcar como instalado
                        </GlowButton>
                      </div>
                    )}
                  </GlassCard>
                </AnimatedFadeIn>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* Provided section */}
        {provided.length > 0 && (
          <SectionBlock title="Configuradas">
            <div className="space-y-2">
              {provided.map((req, idx) => (
                <AnimatedFadeIn key={req.id} delay={idx * 40}>
                  <GlassCard className="border-l-4 border-green-500 !rounded-l-none">
                    <div className="flex items-center gap-3">
                      <StatusPill status="PROVIDED" size="sm" />
                      <span className="flex-1">{req.purpose}</span>
                      <span className="text-xs px-2 py-0.5 bg-elevated rounded">{req.service}</span>
                      {valueStatuses[req.id] && (
                        <StatusPill status="PROVIDED" label="OK" size="sm" />
                      )}
                      {(req.service === "tiendanube" || req.service === "waba") && valueStatuses[req.id] && (
                        <GlowButton
                          onClick={() => validateRequest(req.id)}
                          disabled={validating === req.id}
                          variant="secondary"
                          size="sm"
                        >
                          {validating === req.id ? "Probando..." : "Probar"}
                        </GlowButton>
                      )}
                      <GlowButton
                        onClick={() => updateStatus(req.id, "WAITING")}
                        variant="ghost"
                        size="sm"
                      >
                        Reconfigurar
                      </GlowButton>
                    </div>
                    {validationResults[req.id] && (
                      <div className="mt-2 ml-5">
                        <StatusPill
                          status={validationResults[req.id]!.ok ? "PROVIDED" : "REJECTED"}
                          label={validationResults[req.id]!.message}
                          size="sm"
                        />
                      </div>
                    )}
                  </GlassCard>
                </AnimatedFadeIn>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* Rejected section */}
        {rejected.length > 0 && (
          <SectionBlock title="Rechazadas">
            <div className="space-y-2">
              {rejected.map((req, idx) => (
                <AnimatedFadeIn key={req.id} delay={idx * 40}>
                  <GlassCard className="!p-4">
                    <div className="flex items-center gap-3">
                      <StatusPill status="REJECTED" size="sm" />
                      <span className="flex-1">{req.purpose}</span>
                      <GlowButton
                        onClick={() => updateStatus(req.id, "WAITING")}
                        variant="ghost"
                        size="sm"
                      >
                        Reconfigurar
                      </GlowButton>
                    </div>
                  </GlassCard>
                </AnimatedFadeIn>
              ))}
            </div>
          </SectionBlock>
        )}

        {requests.length === 0 && (
          <p className="text-slate-500">Todo configurado. No se necesitan datos adicionales.</p>
        )}
      </PageContainer>
    );
  }

  // Technical mode: original layout
  return (
    <PageContainer maxWidth="lg">
      <h2 className="text-2xl font-bold mb-2">Requests</h2>
      <p className="text-sm text-slate-400 mb-6">
        Pegar valores de credentials/tokens. Se guardan en vault local (nunca en git).
      </p>

      {message && (
        <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-card text-sm text-blue-200">
          {message}
        </div>
      )}

      <div className="space-y-4">
        {requests.map((req, idx) => (
          <AnimatedFadeIn key={req.id} delay={idx * 50}>
            <GlassCard>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusPill status={req.status} size="sm" />
                    <span className="font-medium">{req.id}</span>
                    <span className="text-xs px-2 py-0.5 bg-elevated rounded">{req.service}</span>
                    {valueStatuses[req.id] && (
                      <StatusPill status="PROVIDED" label="vault ok" size="sm" />
                    )}
                  </div>
                  <p className="text-sm text-slate-300 mb-1">{req.purpose}</p>
                  <div className="text-xs text-slate-500">
                    <span>Scopes: {req.scopes.join(", ")}</span>
                    <span className="mx-2">|</span>
                    <span>Set en: {req.where_to_set}</span>
                  </div>
                  {req.validation_cmd && (
                    <code className="text-xs text-slate-500 block mt-1">$ {req.validation_cmd}</code>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {req.status !== "WAITING" && (
                    <GlowButton
                      onClick={() => updateStatus(req.id, "WAITING")}
                      variant="ghost"
                      size="sm"
                    >
                      Reset
                    </GlowButton>
                  )}
                </div>
              </div>

              {req.status === "WAITING" && req.type !== "tool" && (
                <div className="mt-3 pt-3 border-t border-[rgba(148,163,184,0.08)]">
                  <div className="space-y-2">
                    {req.scopes.map((scope) => (
                      <div key={scope} className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 w-48 flex-shrink-0 font-mono">{scope}</label>
                        <input
                          type="password"
                          placeholder={`Pegar ${scope}...`}
                          value={valueInputs[req.id]?.[scope] ?? ""}
                          onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                          className="flex-1 text-xs bg-elevated border border-[rgba(148,163,184,0.08)] rounded-card px-2 py-1.5 text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <GlowButton
                      onClick={() => saveValues(req)}
                      disabled={saving === req.id}
                      variant="primary"
                      size="sm"
                    >
                      {saving === req.id ? "Guardando..." : "Guardar"}
                    </GlowButton>
                    <GlowButton
                      onClick={() => updateStatus(req.id, "REJECTED")}
                      variant="danger"
                      size="sm"
                    >
                      Rechazar
                    </GlowButton>
                  </div>
                </div>
              )}

              {req.status === "WAITING" && req.type === "tool" && (
                <div className="mt-3 pt-3 border-t border-[rgba(148,163,184,0.08)]">
                  <p className="text-xs text-slate-400 mb-2">
                    Herramienta local. Instalar manualmente y luego marcar como provided:
                  </p>
                  <div className="flex gap-2">
                    <GlowButton
                      onClick={() => updateStatus(req.id, "PROVIDED")}
                      variant="primary"
                      size="sm"
                    >
                      Marcar instalado
                    </GlowButton>
                  </div>
                </div>
              )}
            </GlassCard>
          </AnimatedFadeIn>
        ))}
      </div>
    </PageContainer>
  );
}
