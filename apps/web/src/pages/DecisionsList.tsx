import { useEffect, useState } from "react";
import type { ApiResponse, DecisionLog } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeDecisionKey, formatTimeAgo } from "../humanize";

interface Props {
  filterRunId?: string;
  filterDirectiveId?: string;
}

const KEY_COLORS: Record<string, string> = {
  directive_approve: "text-green-400",
  directive_reject: "text-red-400",
  directive_apply: "text-blue-400",
  system_pause: "text-yellow-400",
  system_resume: "text-green-400",
  task_created: "text-cyan-400",
  task_requeued: "text-orange-400",
  task_blocked_max_attempts: "text-red-400",
  run_completed: "text-green-400",
  run_failed: "text-red-400",
};

const SOURCE_BADGES: Record<string, string> = {
  human: "bg-purple-700 text-purple-200",
  system: "bg-gray-700 text-gray-300",
  runner: "bg-blue-700 text-blue-200",
  gpt: "bg-yellow-700 text-yellow-200",
};

const SOURCE_LABELS_OP: Record<string, string> = {
  human: "Humano",
  system: "Sistema",
  runner: "Agente",
  gpt: "IA",
};

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

export function DecisionsList({ filterRunId, filterDirectiveId }: Props) {
  const [decisions, setDecisions] = useState<DecisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runIdFilter, setRunIdFilter] = useState(filterRunId || "");
  const [directiveIdFilter, setDirectiveIdFilter] = useState(filterDirectiveId || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchDecisions = () => {
    const params = new URLSearchParams();
    if (runIdFilter) params.set("run_id", runIdFilter);
    if (directiveIdFilter) params.set("directive_id", directiveIdFilter);
    params.set("limit", "100");

    apiFetch(`/api/ops/decisions?${params}`)
      .then((r) => r.json())
      .then((data: ApiResponse<DecisionLog[]>) => {
        if (data.ok && data.data) setDecisions(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 15000);
    return () => clearInterval(interval);
  }, [runIdFilter, directiveIdFilter]);

  const isEmbedded = filterRunId || filterDirectiveId;

  return (
    <div className={isEmbedded ? "" : "p-6"}>
      {!isEmbedded && (
        <>
          <h1 className="text-xl font-bold mb-4">
            {isOp ? "Registro de actividad" : "Decisions Log"}
          </h1>
          {!isOp && (
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Filtrar por run_id..."
                value={runIdFilter}
                onChange={(e) => setRunIdFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 w-80"
              />
              <input
                type="text"
                placeholder="Filtrar por directive_id..."
                value={directiveIdFilter}
                onChange={(e) => setDirectiveIdFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 w-80"
              />
              <button
                onClick={fetchDecisions}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm"
              >
                Buscar
              </button>
            </div>
          )}
        </>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : decisions.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {isOp ? "Sin actividad registrada." : "Sin decisiones registradas."}
        </p>
      ) : isOp ? (() => {
        // Filter out noise in operator mode (heartbeats, patches)
        const visible = decisions.filter((d) =>
          d.decision_key !== "runner_heartbeat" && d.decision_key !== "run_patch_saved"
        );
        if (visible.length === 0) {
          return <p className="text-gray-500 text-sm">Sin actividad reciente.</p>;
        }
        return (
        /* Operator mode: clean human-readable list */
        <div className="space-y-2">
          {visible.map((d) => (
            <div key={d.id} className="bg-gray-900 border border-gray-800 rounded p-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${SOURCE_BADGES[d.source] || "bg-gray-700"}`}>
                  {SOURCE_LABELS_OP[d.source] ?? d.source}
                </span>
                <span className={`text-sm flex-1 ${KEY_COLORS[d.decision_key] || "text-gray-300"}`}>
                  {humanizeDecisionKey(d.decision_key)}
                </span>
                <span className="text-xs text-gray-500" title={d.created_at}>
                  {formatTimeAgo(d.created_at)}
                </span>
              </div>
              <button
                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                className="text-xs text-gray-600 hover:text-gray-400 mt-1 transition-colors"
              >
                {expandedId === d.id ? "Ocultar detalles" : "Ver detalles"}
              </button>
              {expandedId === d.id && (
                <div className="mt-2 text-xs text-gray-500 font-mono space-y-1">
                  <div>{JSON.stringify(d.decision_value, null, 2)}</div>
                  {d.context && <div>ctx: {JSON.stringify(d.context, null, 2)}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        );
      })() : (
        /* Technical mode: full raw data */
        <div className="space-y-2">
          {decisions.map((d) => (
            <div key={d.id} className="bg-gray-900 border border-gray-800 rounded p-3">
              <div className="flex items-center gap-3 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded ${SOURCE_BADGES[d.source] || "bg-gray-700"}`}>
                  {d.source}
                </span>
                <span className={`text-sm font-mono font-semibold ${KEY_COLORS[d.decision_key] || "text-gray-300"}`}>
                  {d.decision_key}
                </span>
                <span className="text-xs text-gray-500 ml-auto" title={d.created_at}>
                  {timeAgo(d.created_at)}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono mt-1">
                {JSON.stringify(d.decision_value, null, 0)}
              </div>
              {d.context && (
                <div className="text-xs text-gray-600 font-mono mt-1">
                  ctx: {JSON.stringify(d.context, null, 0)}
                </div>
              )}
              <div className="flex gap-4 mt-1 text-xs text-gray-600">
                {d.run_id && <span>run: {d.run_id.substring(0, 8)}</span>}
                {d.directive_id && <span>directive: {d.directive_id.substring(0, 12)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
