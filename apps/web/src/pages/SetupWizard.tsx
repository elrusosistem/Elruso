import { useEffect, useState } from "react";
import type { ApiResponse, OpsRequest } from "@elruso/types";

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

  const fetchAll = () => {
    fetch("/api/ops/requests")
      .then((r) => r.json())
      .then((data: ApiResponse<OpsRequest[]>) => {
        if (data.ok && data.data) {
          setRequests(data.data);
          data.data.forEach((req) => {
            fetch(`/api/ops/requests/${req.id}/value/status`)
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
      const res = await fetch(`/api/ops/requests/${reqId}/value`, {
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
      const res = await fetch(`/api/ops/requests/${reqId}/validate`, { method: "POST" });
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
      const res = await fetch(`/api/ops/actions/${action}`, { method: "POST" });
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

  if (loading) return <div className="p-8 text-gray-400">Cargando setup...</div>;

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold mb-2">Setup Wizard</h2>
      <p className="text-sm text-gray-400 mb-6">
        El panel corre sin keys. Peg&aacute; valores para habilitar acciones (migrate/seed/deploy).
      </p>

      {message && (
        <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded text-sm text-blue-200">
          {message}
        </div>
      )}

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-lg">{section.title}</span>
                <div className="flex gap-1">
                  {section.requestIds.map((id) => (
                    <span
                      key={id}
                      className={`text-xs px-2 py-0.5 rounded ${
                        vaultStatus[id]
                          ? "bg-green-900 text-green-300"
                          : "bg-yellow-900 text-yellow-300"
                      }`}
                    >
                      {id}: {vaultStatus[id] ? "ok" : "falta"}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-gray-400 text-sm">{expanded[section.title] ? "▲" : "▼"}</span>
            </button>

            {expanded[section.title] && (
              <div className="px-4 pb-4 space-y-4">
                {section.requestIds.map((reqId) => {
                  const req = getRequest(reqId);
                  if (!req) return null;
                  const val = validations[reqId];

                  return (
                    <div key={reqId} className="border border-gray-700 rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm font-medium">{reqId}</span>
                        <span className="text-xs text-gray-500">{req.purpose}</span>
                      </div>

                      <div className="space-y-2">
                        {req.scopes.map((scope) => (
                          <div key={scope} className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 w-52 flex-shrink-0 font-mono">{scope}</label>
                            {vaultStatus[reqId] ? (
                              <span className="text-xs text-green-400">guardado en vault</span>
                            ) : (
                              <input
                                type="password"
                                placeholder={`Pegar ${scope}...`}
                                value={valueInputs[reqId]?.[scope] ?? ""}
                                onChange={(e) => handleInput(reqId, scope, e.target.value)}
                                className="flex-1 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        {!vaultStatus[reqId] && (
                          <button
                            onClick={() => saveValues(reqId)}
                            disabled={saving === reqId}
                            className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors"
                          >
                            {saving === reqId ? "Guardando..." : "Guardar"}
                          </button>
                        )}
                        {vaultStatus[reqId] && (
                          <button
                            onClick={() => validate(reqId)}
                            disabled={validating === reqId}
                            className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 rounded transition-colors"
                          >
                            {validating === reqId ? "Validando..." : "Validar"}
                          </button>
                        )}
                        {val && (
                          <span className={`text-xs px-2 py-1 rounded ${val.ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                            {val.message}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {section.actions.length > 0 && (
                  <div className="border-t border-gray-700 pt-3">
                    <div className="text-xs text-gray-500 mb-2">Acciones</div>
                    <div className="flex gap-2 flex-wrap">
                      {section.actions.map((act) => (
                        <button
                          key={act.action}
                          onClick={() => runAction(act.action)}
                          disabled={!canRunAction(act.requiresIds) || (actionLog?.running ?? false)}
                          className="text-xs px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 rounded transition-colors"
                          title={!canRunAction(act.requiresIds) ? `Requiere: ${act.requiresIds.join(", ")}` : ""}
                        >
                          {actionLog?.action === act.action && actionLog.running ? "Ejecutando..." : act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {actionLog?.result && (
        <div className="mt-6 bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm">{actionLog.action}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${actionLog.result.ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
              {actionLog.result.ok ? "OK" : `Error (exit ${actionLog.result.exitCode})`}
            </span>
          </div>
          <pre className="text-xs text-gray-300 bg-gray-900 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">
            {actionLog.result.output || "(sin output)"}
          </pre>
        </div>
      )}
    </div>
  );
}
