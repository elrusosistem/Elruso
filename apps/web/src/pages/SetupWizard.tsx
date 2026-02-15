import { useEffect, useState } from "react";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { apiFetch } from "../api";
import {
  PageContainer, GlassCard, GlowButton, StatusPill,
  SectionBlock, HeroPanel, AnimatedFadeIn, ConsoleBlock2026,
} from "../ui2026";

interface SectionConfig {
  title: string;
  service: string;
  requestIds: string[];
  actions: { label: string; action: string; requiresIds: string[] }[];
}

const SECTIONS: SectionConfig[] = [
  {
    title: "Supabase",
    service: "supabase",
    requestIds: ["REQ-001", "REQ-005"],
    actions: [
      { label: "Migrar DB", action: "migrate", requiresIds: ["REQ-005"] },
      { label: "Seed Ops", action: "seed", requiresIds: ["REQ-005"] },
    ],
  },
  {
    title: "Render",
    service: "render",
    requestIds: ["REQ-002", "REQ-007"],
    actions: [
      { label: "Deploy Staging API", action: "deploy-render", requiresIds: ["REQ-002", "REQ-007"] },
    ],
  },
  {
    title: "Vercel",
    service: "vercel",
    requestIds: ["REQ-003", "REQ-008"],
    actions: [
      { label: "Deploy Staging Web", action: "deploy-vercel", requiresIds: ["REQ-003"] },
    ],
  },
];

interface ValueInputs {
  [requestId: string]: { [scope: string]: string };
}

interface VaultStatus {
  [requestId: string]: boolean;
}

interface ValidationResult {
  [requestId: string]: { ok: boolean; message: string } | null;
}

interface ActionLog {
  action: string;
  running: boolean;
  result: { ok: boolean; output: string; exitCode: number } | null;
}

export function SetupWizard() {
  const [requests, setRequests] = useState<OpsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [valueInputs, setValueInputs] = useState<ValueInputs>({});
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({});
  const [validations, setValidations] = useState<ValidationResult>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<ActionLog | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Supabase: true, Render: true, Vercel: true });
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  const fetchAll = () => {
    apiFetch("/api/ops/requests")
      .then((r) => r.json())
      .then((data: ApiResponse<OpsRequest[]>) => {
        if (data.ok && data.data) {
          setRequests(data.data);
          data.data.forEach((req) => {
            apiFetch(`/api/ops/requests/${req.id}/value/status`)
              .then((r) => r.json())
              .then((s: ApiResponse<{ has_value: boolean }>) => {
                if (s.ok && s.data) {
                  setVaultStatus((prev) => ({ ...prev, [req.id]: s.data!.has_value }));
                }
              })
              .catch(() => {});
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const getRequest = (id: string) => requests.find((r) => r.id === id);

  const handleInput = (reqId: string, scope: string, value: string) => {
    setValueInputs((prev) => ({
      ...prev,
      [reqId]: { ...(prev[reqId] ?? {}), [scope]: value },
    }));
  };

  const saveValues = async (reqId: string) => {
    const values = valueInputs[reqId];
    if (!values || Object.values(values).every((v) => !v.trim())) {
      setMessage("Completar al menos un valor");
      return;
    }
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) clean[k] = v.trim();
    }
    setSaving(reqId);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/ops/requests/${reqId}/value`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: clean }),
      });
      const data: ApiResponse<{ saved: boolean }> = await res.json();
      if (data.ok) {
        setMessage(`${reqId}: guardado en vault.`);
        setValueInputs((prev) => ({ ...prev, [reqId]: {} }));
        fetchAll();
      } else {
        setMessage(data.error ?? "Error guardando");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const validate = async (reqId: string) => {
    setValidating(reqId);
    setValidations((prev) => ({ ...prev, [reqId]: null }));
    try {
      const res = await apiFetch(`/api/ops/requests/${reqId}/validate`, { method: "POST" });
      const data: ApiResponse<{ ok: boolean; message: string }> = await res.json();
      if (data.ok && data.data) {
        setValidations((prev) => ({ ...prev, [reqId]: data.data! }));
      }
    } catch {
      setValidations((prev) => ({ ...prev, [reqId]: { ok: false, message: "Error de red" } }));
    } finally {
      setValidating(null);
    }
  };

  const runAction = async (action: string) => {
    setActionLog({ action, running: true, result: null });
    try {
      const res = await apiFetch(`/api/ops/actions/${action}`, { method: "POST" });
      const data: ApiResponse<{ ok: boolean; output: string; exitCode: number }> = await res.json();
      if (data.ok && data.data) {
        setActionLog({ action, running: false, result: data.data });
      } else {
        setActionLog({ action, running: false, result: { ok: false, output: data.error ?? "Error", exitCode: -1 } });
      }
    } catch (e) {
      setActionLog({ action, running: false, result: { ok: false, output: (e as Error).message, exitCode: -1 } });
    }
  };

  const canRunAction = (requiresIds: string[]) => requiresIds.every((id) => vaultStatus[id]);

  if (loading) return <div className="p-8 text-slate-500">Cargando setup...</div>;

  return (
    <PageContainer maxWidth="lg">
      <HeroPanel
        title="Setup Wizard"
        subtitle="El panel corre sin keys. Pega valores para habilitar acciones (migrate/seed/deploy)."
      />

      {message && (
        <GlassCard glow="primary" className="mb-6 !p-3">
          <span className="text-sm text-blue-200">{message}</span>
        </GlassCard>
      )}

      <div className="space-y-4">
        {SECTIONS.map((section, sectionIndex) => (
          <AnimatedFadeIn key={section.title} delay={sectionIndex * 60}>
            <GlassCard className="!p-0 overflow-hidden">
              {/* Section header / toggle */}
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-elevated/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-lg text-white">{section.title}</span>
                  <div className="flex gap-1.5">
                    {section.requestIds.map((id) => (
                      <StatusPill
                        key={id}
                        status={vaultStatus[id] ? "done" : "MISSING"}
                        label={`${id}: ${vaultStatus[id] ? "ok" : "falta"}`}
                      />
                    ))}
                  </div>
                </div>
                <span className="text-slate-500 text-sm">{expanded[section.title] ? "\u25B2" : "\u25BC"}</span>
              </button>

              {/* Section body */}
              {expanded[section.title] && (
                <div className="px-5 pb-5 space-y-4 border-t border-[rgba(148,163,184,0.06)]">
                  {section.requestIds.map((reqId) => {
                    const req = getRequest(reqId);
                    if (!req) return null;
                    const val = validations[reqId];

                    return (
                      <div key={reqId} className="mt-4 border border-[rgba(148,163,184,0.08)] rounded-card p-4 bg-elevated/30">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-sm font-medium text-slate-200">{reqId}</span>
                          <span className="text-xs text-slate-500">{req.purpose}</span>
                        </div>

                        <div className="space-y-2">
                          {req.scopes.map((scope) => (
                            <div key={scope} className="flex items-center gap-2">
                              <label className="text-xs text-slate-400 w-52 flex-shrink-0 font-mono">{scope}</label>
                              {vaultStatus[reqId] && !editing[reqId] ? (
                                <span className="text-xs text-green-400">guardado en vault</span>
                              ) : (
                                <input
                                  type="password"
                                  placeholder={`Pegar ${scope}...`}
                                  value={valueInputs[reqId]?.[scope] ?? ""}
                                  onChange={(e) => handleInput(reqId, scope, e.target.value)}
                                  className="flex-1 text-xs bg-elevated border border-[rgba(148,163,184,0.08)] rounded-card px-3 py-2 text-slate-200 placeholder-slate-600 focus:border-accent-primary focus:outline-none transition-colors"
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          {(!vaultStatus[reqId] || editing[reqId]) && (
                            <GlowButton
                              onClick={() => { saveValues(reqId); setEditing((prev) => ({ ...prev, [reqId]: false })); }}
                              disabled={saving === reqId}
                              variant="primary"
                              size="sm"
                            >
                              {saving === reqId ? "Guardando..." : "Guardar"}
                            </GlowButton>
                          )}
                          {vaultStatus[reqId] && !editing[reqId] && (
                            <GlowButton
                              onClick={() => setEditing((prev) => ({ ...prev, [reqId]: true }))}
                              variant="secondary"
                              size="sm"
                            >
                              Editar
                            </GlowButton>
                          )}
                          {vaultStatus[reqId] && (
                            <GlowButton
                              onClick={() => validate(reqId)}
                              disabled={validating === reqId}
                              variant="ghost"
                              size="sm"
                            >
                              {validating === reqId ? "Validando..." : "Validar"}
                            </GlowButton>
                          )}
                          {val && (
                            <StatusPill
                              status={val.ok ? "done" : "failed"}
                              label={val.message}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {section.actions.length > 0 && (
                    <div className="border-t border-[rgba(148,163,184,0.06)] pt-4">
                      <div className="text-xs text-slate-500 mb-2">Acciones</div>
                      <div className="flex gap-2 flex-wrap">
                        {section.actions.map((act) => (
                          <GlowButton
                            key={act.action}
                            onClick={() => runAction(act.action)}
                            disabled={!canRunAction(act.requiresIds) || (actionLog?.running ?? false)}
                            variant="primary"
                            size="sm"
                          >
                            {actionLog?.action === act.action && actionLog.running ? "Ejecutando..." : act.label}
                          </GlowButton>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          </AnimatedFadeIn>
        ))}
      </div>

      {actionLog?.result && (
        <AnimatedFadeIn className="mt-6">
          <GlassCard>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium text-sm text-slate-200">{actionLog.action}</span>
              <StatusPill
                status={actionLog.result.ok ? "done" : "failed"}
                label={actionLog.result.ok ? "OK" : `Error (exit ${actionLog.result.exitCode})`}
              />
            </div>
            <ConsoleBlock2026
              title="Output"
              content={actionLog.result.output || "(sin output)"}
              maxHeight="256px"
            />
          </GlassCard>
        </AnimatedFadeIn>
      )}
    </PageContainer>
  );
}
