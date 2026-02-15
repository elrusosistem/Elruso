import { useEffect, useState } from "react";
import type { ApiResponse, OpsRequest, RequestStatus } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";

const STATUS_COLORS: Record<string, string> = {
  WAITING: "bg-yellow-500",
  PROVIDED: "bg-green-500",
  REJECTED: "bg-red-500",
  MISSING: "bg-red-500",
};

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

  if (loading) return <div className="p-8 text-gray-400">{isOp ? "Cargando configuracion..." : "Cargando requests..."}</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

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
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-2">Configuracion</h2>
        <p className="text-sm text-gray-400 mb-6">
          Datos que el sistema necesita para funcionar. Los valores se guardan de forma segura.
        </p>

        {message && (
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded text-sm text-blue-200">
            {message}
          </div>
        )}

        {/* Required for planning section */}
        {requiredForPlanning.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3 text-orange-400">Requeridos para generar plan</h3>
            <p className="text-sm text-gray-400 mb-4">Sin estos datos el sistema no puede generar planes.</p>
            <div className="space-y-4">
              {requiredForPlanning.map((req) => (
                <div key={req.id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-orange-500">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[req.status] ?? "bg-gray-500"}`} />
                    <span className="font-medium">{req.purpose}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{req.service}</span>
                    <span className="text-xs px-2 py-0.5 bg-orange-900 text-orange-300 rounded">Requerido</span>
                  </div>
                  {req.type !== "tool" ? (
                    <div className="mt-3">
                      <div className="space-y-2">
                        {req.scopes.map((scope) => (
                          <div key={scope} className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 w-48 flex-shrink-0">{scope}</label>
                            <input
                              type="password"
                              placeholder={`Pegar ${scope}...`}
                              value={valueInputs[req.id]?.[scope] ?? ""}
                              onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                              className="flex-1 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveValues(req)}
                          disabled={saving === req.id}
                          className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors"
                        >
                          {saving === req.id ? "Guardando..." : "Configurar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <button
                        onClick={() => updateStatus(req.id, "PROVIDED")}
                        className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 rounded transition-colors"
                      >
                        Marcar como instalado
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending / Missing section */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3 text-yellow-400">Faltan configurar</h3>
            <p className="text-sm text-gray-400 mb-4">Sin esto el sistema no puede avanzar.</p>
            <div className="space-y-4">
              {pending.map((req) => (
                <div key={req.id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-yellow-500">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[req.status] ?? "bg-gray-500"}`} />
                    <span className="font-medium">{req.purpose}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{req.service}</span>
                  </div>

                  {req.type !== "tool" ? (
                    <div className="mt-3">
                      <div className="space-y-2">
                        {req.scopes.map((scope) => (
                          <div key={scope} className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 w-48 flex-shrink-0">{scope}</label>
                            <input
                              type="password"
                              placeholder={`Pegar ${scope}...`}
                              value={valueInputs[req.id]?.[scope] ?? ""}
                              onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                              className="flex-1 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveValues(req)}
                          disabled={saving === req.id}
                          className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors"
                        >
                          {saving === req.id ? "Guardando..." : "Configurar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <p className="text-xs text-gray-400 mb-2">
                        Herramienta que debe instalarse manualmente.
                      </p>
                      <button
                        onClick={() => updateStatus(req.id, "PROVIDED")}
                        className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 rounded transition-colors"
                      >
                        Marcar como instalado
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Provided section */}
        {provided.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-3 text-green-400">Configuradas</h3>
            <div className="space-y-2">
              {provided.map((req) => (
                <div key={req.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="flex-1">{req.purpose}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{req.service}</span>
                    {valueStatuses[req.id] && (
                      <span className="text-xs px-2 py-0.5 bg-green-900 text-green-300 rounded">OK</span>
                    )}
                    {(req.service === "tiendanube" || req.service === "waba") && valueStatuses[req.id] && (
                      <button
                        onClick={() => validateRequest(req.id)}
                        disabled={validating === req.id}
                        className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 rounded transition-colors"
                      >
                        {validating === req.id ? "Probando..." : "Probar"}
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(req.id, "WAITING")}
                      className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    >
                      Reconfigurar
                    </button>
                  </div>
                  {validationResults[req.id] && (
                    <div className="mt-2 ml-5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          validationResults[req.id]!.ok
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
                        }`}
                      >
                        {validationResults[req.id]!.message}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rejected section */}
        {rejected.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 text-red-400">Rechazadas</h3>
            <div className="space-y-2">
              {rejected.map((req) => (
                <div key={req.id} className="bg-gray-800 rounded-lg p-4 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="flex-1">{req.purpose}</span>
                  <button
                    onClick={() => updateStatus(req.id, "WAITING")}
                    className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Reconfigurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {requests.length === 0 && (
          <p className="text-gray-500">Todo configurado. No se necesitan datos adicionales.</p>
        )}
      </div>
    );
  }

  // Technical mode: original layout
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-2">Requests</h2>
      <p className="text-sm text-gray-400 mb-6">
        Pegar valores de credentials/tokens. Se guardan en vault local (nunca en git).
      </p>

      {message && (
        <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded text-sm text-blue-200">
          {message}
        </div>
      )}

      <div className="space-y-4">
        {requests.map((req) => (
          <div key={req.id} className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[req.status] ?? "bg-gray-500"}`} />
                  <span className="font-medium">{req.id}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{req.service}</span>
                  {valueStatuses[req.id] && (
                    <span className="text-xs px-2 py-0.5 bg-green-900 text-green-300 rounded">vault ok</span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mb-1">{req.purpose}</p>
                <div className="text-xs text-gray-500">
                  <span>Scopes: {req.scopes.join(", ")}</span>
                  <span className="mx-2">|</span>
                  <span>Set en: {req.where_to_set}</span>
                </div>
                {req.validation_cmd && (
                  <code className="text-xs text-gray-500 block mt-1">$ {req.validation_cmd}</code>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {req.status !== "WAITING" && (
                  <button
                    onClick={() => updateStatus(req.id, "WAITING")}
                    className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {req.status === "WAITING" && req.type !== "tool" && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="space-y-2">
                  {req.scopes.map((scope) => (
                    <div key={scope} className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 w-48 flex-shrink-0 font-mono">{scope}</label>
                      <input
                        type="password"
                        placeholder={`Pegar ${scope}...`}
                        value={valueInputs[req.id]?.[scope] ?? ""}
                        onChange={(e) => handleInputChange(req.id, scope, e.target.value)}
                        className="flex-1 text-xs bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => saveValues(req)}
                    disabled={saving === req.id}
                    className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded transition-colors"
                  >
                    {saving === req.id ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    onClick={() => updateStatus(req.id, "REJECTED")}
                    className="text-xs px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            )}

            {req.status === "WAITING" && req.type === "tool" && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-2">
                  Herramienta local. Instalar manualmente y luego marcar como provided:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(req.id, "PROVIDED")}
                    className="text-xs px-4 py-1.5 bg-green-700 hover:bg-green-600 rounded transition-colors"
                  >
                    Marcar instalado
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
