import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeTaskStatus, formatNextRun, isOperatorVisible } from "../humanize";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  StatusPill,
  SectionBlock,
  HeroPanel,
  AnimatedFadeIn,
} from "../ui2026";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  branch: string;
  depends_on: string[];
  blocked_by: string[];
  directive_id?: string;
  claimed_by?: string;
  claimed_at?: string;
  attempts?: number;
  max_attempts?: number;
  next_run_at?: string;
  last_error?: string;
}

const STATUSES = ["ready", "running", "done", "failed", "blocked"];

const STATUS_LABELS_OP: Record<string, string> = {
  "": "Todas",
  ready: "Pendientes",
  running: "En curso",
  done: "Listas",
  failed: "Fallaron",
  blocked: "Necesitan configuracion",
};

export function TasksList() {
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchTasks = (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    apiFetch(`/api/ops/tasks${qs}`)
      .then((r) => r.json())
      .then((data: ApiResponse<TaskEntry[]>) => {
        if (data.ok && data.data) setTasks(data.data);
        else setError(data.error ?? "Error cargando tasks");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(statusFilter || undefined); }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/api/ops/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchTasks(statusFilter || undefined);
  };

  if (loading) return <PageContainer maxWidth="xl"><div className="text-slate-400">Cargando tareas...</div></PageContainer>;
  if (error) return <PageContainer maxWidth="xl"><div className="text-red-400">{error}</div></PageContainer>;

  // In operator mode, filter out test/done/deduped tasks
  const visibleTasks = isOp ? tasks.filter((t) => isOperatorVisible(t)) : tasks;
  const phases = [...new Set(visibleTasks.map((t) => t.phase))].sort((a, b) => a - b);

  const filterButtons = (
    <div className="flex gap-2 flex-wrap">
      <GlowButton
        variant={statusFilter === "" ? "primary" : "ghost"}
        size="sm"
        onClick={() => setStatusFilter("")}
      >
        {isOp ? "Todas" : "Todas"}
      </GlowButton>
      {STATUSES.map((s) => (
        <GlowButton
          key={s}
          variant={statusFilter === s ? "primary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter(s)}
        >
          {isOp ? STATUS_LABELS_OP[s] ?? s : s}
        </GlowButton>
      ))}
    </div>
  );

  return (
    <div data-tour="tasks-list">
    <PageContainer maxWidth="xl">
      <HeroPanel
        title={isOp ? "Tareas" : "Tasks"}
        actions={filterButtons}
      />

      {phases.map((phase, phaseIdx) => {
        const phaseTasks = visibleTasks.filter((t) => t.phase === phase);
        if (phaseTasks.length === 0) return null;
        return (
          <AnimatedFadeIn key={phase} delay={phaseIdx * 60}>
            <SectionBlock
              title={!isOp ? `Fase ${phase}` : undefined}
            >
              <div className="space-y-2">
                {phaseTasks.map((task) => {
                  const hStatus = humanizeTaskStatus(task.status);
                  const nextRun = formatNextRun(task.next_run_at);
                  const attempts = task.attempts ?? 0;
                  const maxAttempts = task.max_attempts ?? 3;
                  const isRetrying = task.status === "failed" && attempts > 0 && attempts < maxAttempts;

                  return (
                    <GlassCard key={task.id} hover className="!p-3">
                      <div className="flex items-center gap-3">
                        <StatusPill
                          status={task.status}
                          label={isOp ? (isRetrying ? "Reintentando" : hStatus.label) : task.status}
                          size="sm"
                          pulse={task.status === "running"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {!isOp && <span className="font-mono text-xs text-slate-500">{task.id}</span>}
                            <span className="text-sm text-slate-200 truncate">{task.title}</span>
                            {isOp ? (
                              <>
                                {isRetrying && (
                                  <StatusPill status="blocked" label={`Reintentos: ${attempts}/${maxAttempts}`} size="sm" />
                                )}
                              </>
                            ) : (
                              <>
                                {task.status === "running" && task.claimed_by && (
                                  <StatusPill status="running" label="Claimed" size="sm" />
                                )}
                                {attempts > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-slate-400">
                                    {attempts}/{maxAttempts}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {!isOp && (
                          <select
                            value={task.status}
                            onChange={(e) => updateStatus(task.id, e.target.value)}
                            className="text-xs bg-elevated border border-[rgba(148,163,184,0.08)] rounded-md text-slate-200 px-2 py-1"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 ml-5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {isOp ? (
                          <>
                            {task.status === "blocked" && (
                              <a href="#/requests" className="text-red-400 hover:underline">
                                Ir a Configuracion
                              </a>
                            )}
                            {task.blocked_by.length > 0 && task.status !== "blocked" && (
                              <span className="text-red-400">Requiere accion</span>
                            )}
                            {isRetrying && nextRun && (
                              <span className="text-yellow-400">{nextRun}</span>
                            )}
                          </>
                        ) : (
                          <>
                            {task.depends_on.length > 0 && (
                              <span>Deps: {task.depends_on.join(", ")}</span>
                            )}
                            {task.blocked_by.length > 0 && (
                              <span className="text-red-400">Blocked: {task.blocked_by.join(", ")}</span>
                            )}
                            {task.claimed_by && (
                              <span>Runner: {task.claimed_by}</span>
                            )}
                            {task.claimed_at && (
                              <span>Claimed: {new Date(task.claimed_at).toLocaleString("es-AR")}</span>
                            )}
                            {task.next_run_at && (
                              <span className="text-yellow-400">Next: {new Date(task.next_run_at).toLocaleString("es-AR")}</span>
                            )}
                            {task.last_error && (
                              <span className="text-red-400 truncate max-w-xs" title={task.last_error}>
                                Error: {task.last_error}
                              </span>
                            )}
                            {task.directive_id && (
                              <span className="text-blue-400">{task.directive_id}</span>
                            )}
                          </>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </SectionBlock>
          </AnimatedFadeIn>
        );
      })}
    </PageContainer>
    </div>
  );
}
