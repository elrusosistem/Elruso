import { useEffect, useState } from "react";
import type { ApiResponse, DecisionLog } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeDecisionKey, formatTimeAgo } from "../humanize";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  SectionBlock,
  AnimatedFadeIn,
  ActivityFeed2026,
  type ActivityItem,
} from "../ui2026";

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

const KEY_TO_ICON: Record<string, ActivityItem["icon"]> = {
  directive_approve: "success",
  directive_reject: "error",
  directive_apply: "info",
  system_pause: "warning",
  system_resume: "success",
  task_created: "info",
  task_requeued: "warning",
  task_blocked_max_attempts: "error",
  run_completed: "success",
  run_failed: "error",
};

const SOURCE_BADGES: Record<string, string> = {
  human: "bg-purple-700 text-purple-200",
  system: "bg-slate-700 text-slate-300",
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

  /* Operator mode: map decisions to ActivityItem[] for ActivityFeed2026 */
  const buildActivityItems = (list: DecisionLog[]): ActivityItem[] =>
    list.map((d) => ({
      id: d.id,
      icon: KEY_TO_ICON[d.decision_key] || "neutral",
      label: humanizeDecisionKey(d.decision_key),
      source: SOURCE_LABELS_OP[d.source] ?? d.source,
      timestamp: formatTimeAgo(d.created_at),
      detail: expandedId === d.id ? (
        <div className="text-xs text-slate-500 font-mono space-y-1">
          <div>{JSON.stringify(d.decision_value, null, 2)}</div>
          {d.context && <div>ctx: {JSON.stringify(d.context, null, 2)}</div>}
        </div>
      ) : undefined,
    }));

  const content = (() => {
    if (loading) {
      return <p className="text-slate-500 text-sm">Cargando...</p>;
    }

    if (decisions.length === 0) {
      return (
        <p className="text-slate-500 text-sm">
          {isOp ? "Sin actividad registrada." : "Sin decisiones registradas."}
        </p>
      );
    }

    if (isOp) {
      // Filter out noise in operator mode (heartbeats, patches)
      const visible = decisions.filter(
        (d) => d.decision_key !== "runner_heartbeat" && d.decision_key !== "run_patch_saved"
      );

      if (visible.length === 0) {
        return <p className="text-slate-500 text-sm">Sin actividad reciente.</p>;
      }

      return (
        <GlassCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-[rgba(148,163,184,0.06)]">
            {visible.map((d) => (
              <div
                key={d.id}
                className="px-4 py-3 transition-colors hover:bg-elevated/50 cursor-pointer"
                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    KEY_TO_ICON[d.decision_key] === "success" ? "bg-green-400" :
                    KEY_TO_ICON[d.decision_key] === "error" ? "bg-red-400" :
                    KEY_TO_ICON[d.decision_key] === "warning" ? "bg-yellow-400" :
                    KEY_TO_ICON[d.decision_key] === "info" ? "bg-blue-400" : "bg-slate-400"
                  }`} />
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    d.source === "human" ? "text-blue-400 bg-blue-500/15 border-blue-500/20" :
                    d.source === "gpt" ? "text-violet-400 bg-violet-500/15 border-violet-500/20" :
                    d.source === "runner" ? "text-green-400 bg-green-500/15 border-green-500/20" :
                    "text-slate-400 bg-slate-500/15 border-slate-500/20"
                  }`}>
                    {SOURCE_LABELS_OP[d.source] ?? d.source}
                  </span>
                  <span className={`text-sm flex-1 ${KEY_COLORS[d.decision_key] || "text-slate-300"}`}>
                    {humanizeDecisionKey(d.decision_key)}
                  </span>
                  <span className="text-xs text-slate-500" title={d.created_at}>
                    {formatTimeAgo(d.created_at)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId(expandedId === d.id ? null : d.id);
                  }}
                  className="text-xs text-slate-600 hover:text-slate-400 mt-1 ml-5 transition-colors"
                >
                  {expandedId === d.id ? "Ocultar detalles" : "Ver detalles"}
                </button>
                {expandedId === d.id && (
                  <div className="mt-2 ml-5 text-xs text-slate-500 font-mono space-y-1">
                    <div>{JSON.stringify(d.decision_value, null, 2)}</div>
                    {d.context && <div>ctx: {JSON.stringify(d.context, null, 2)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      );
    }

    /* Technical mode: full raw data */
    return (
      <div className="space-y-2">
        {decisions.map((d) => (
          <GlassCard key={d.id} hover className="!p-3">
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${
                d.source === "human" ? "text-blue-400 bg-blue-500/15 border-blue-500/20" :
                d.source === "gpt" ? "text-violet-400 bg-violet-500/15 border-violet-500/20" :
                d.source === "runner" ? "text-green-400 bg-green-500/15 border-green-500/20" :
                "text-slate-400 bg-slate-500/15 border-slate-500/20"
              }`}>
                {d.source}
              </span>
              <span className={`text-sm font-mono font-semibold ${KEY_COLORS[d.decision_key] || "text-slate-300"}`}>
                {d.decision_key}
              </span>
              <span className="text-xs text-slate-500 ml-auto" title={d.created_at}>
                {timeAgo(d.created_at)}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              {JSON.stringify(d.decision_value, null, 0)}
            </div>
            {d.context && (
              <div className="text-xs text-slate-600 font-mono mt-1">
                ctx: {JSON.stringify(d.context, null, 0)}
              </div>
            )}
            <div className="flex gap-4 mt-1 text-xs text-slate-600">
              {d.run_id && <span>run: {d.run_id.substring(0, 8)}</span>}
              {d.directive_id && <span>directive: {d.directive_id.substring(0, 12)}</span>}
            </div>
          </GlassCard>
        ))}
      </div>
    );
  })();

  if (isEmbedded) {
    return <div>{content}</div>;
  }

  return (
    <PageContainer maxWidth="xl">
      <AnimatedFadeIn>
        <SectionBlock
          title={isOp ? "Registro de actividad" : "Decisions Log"}
          actions={
            !isOp ? (
              <GlowButton variant="secondary" size="sm" onClick={fetchDecisions}>
                Buscar
              </GlowButton>
            ) : undefined
          }
        >
          {!isOp && (
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                placeholder="Filtrar por run_id..."
                value={runIdFilter}
                onChange={(e) => setRunIdFilter(e.target.value)}
                className="bg-elevated border border-[rgba(148,163,184,0.08)] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 w-80 focus:outline-none focus:border-[rgba(148,163,184,0.2)] transition-colors"
              />
              <input
                type="text"
                placeholder="Filtrar por directive_id..."
                value={directiveIdFilter}
                onChange={(e) => setDirectiveIdFilter(e.target.value)}
                className="bg-elevated border border-[rgba(148,163,184,0.08)] rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 w-80 focus:outline-none focus:border-[rgba(148,163,184,0.2)] transition-colors"
              />
            </div>
          )}
          {content}
        </SectionBlock>
      </AnimatedFadeIn>
    </PageContainer>
  );
}
