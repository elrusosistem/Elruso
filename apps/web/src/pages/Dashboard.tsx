import { useEffect, useState, useCallback } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { OPERATOR_STAT_LABELS, humanizeRunnerName, humanizeRunnerStatus } from "../humanize";
import {
  PageContainer, HeroPanel, GlassCard, GlowButton, MetricCard,
  SectionBlock, StatusPill, AnimatedFadeIn, Tooltip2026,
} from "../ui2026";

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  created_at?: string;
}

interface ChecklistState {
  hasPlan: boolean;
  hasApproved: boolean;
  hasDoneTask: boolean;
  hasSuccessRun: boolean;
}

interface Metrics {
  tasks: { ready: number; running: number; blocked: number; failed: number; done: number };
  runners: { online: number; total: number };
  runs: {
    last_run_at: string | null;
    fail_rate_last_20: number | null;
    avg_ready_to_done_seconds_last_20: number | null;
    last_24h: number;
    fails_last_24h: number;
    deduped_last_24h: number;
    deduped_total: number;
  };
  backlog: { oldest_ready_age_seconds: number | null };
}

interface Runner {
  runner_id: string;
  status: string;
  last_seen_at: string;
  meta: { hostname?: string; pid?: number } | null;
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [nextTasks, setNextTasks] = useState<TaskEntry[]>([]);
  const [checklist, setChecklist] = useState<ChecklistState>({ hasPlan: false, hasApproved: false, hasDoneTask: false, hasSuccessRun: false });
  const [loading, setLoading] = useState(true);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const [gptRunning, setGptRunning] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const [vmStatus, setVmStatus] = useState<string | null>(null);
  const [vmConfigured, setVmConfigured] = useState(false);
  const [vmLoading, setVmLoading] = useState(false);
  const [vmProgress, setVmProgress] = useState<{ step: string; pct: number } | null>(null);

  const [wizardDone, setWizardDone] = useState<boolean | null>(null);
  const [canPlan, setCanPlan] = useState(true);
  const [planBlockReason, setPlanBlockReason] = useState<string>("");
  const [activeObjectives, setActiveObjectives] = useState<{ id: string; title: string; priority: number }[]>([]);

  const fetchAll = useCallback(() => {
    const promises: Promise<unknown>[] = [
      apiFetch("/api/ops/metrics").then((r) => r.json()),
      apiFetch("/api/ops/runner/status").then((r) => r.json()),
    ];
    if (isOp) {
      promises.push(
        apiFetch("/api/ops/tasks?status=ready").then((r) => r.json()),
        apiFetch("/api/ops/system/status").then((r) => r.json()),
        apiFetch("/api/ops/directives").then((r) => r.json()),
        apiFetch("/api/runs").then((r) => r.json()),
        apiFetch("/api/ops/wizard/status").then((r) => r.json()),
        apiFetch("/api/ops/gpt/preconditions").then((r) => r.json()),
        apiFetch("/api/ops/runner/vm").then((r) => r.json()),
      );
    }
    Promise.all(promises)
      .then(([mData, rData, tData, sData, dData, runsData, wizData, preData, vmData]: unknown[]) => {
        const m = mData as ApiResponse<Metrics>;
        const r = rData as ApiResponse<Runner[]>;
        if (m.ok && m.data) setMetrics(m.data);
        if (r.ok && r.data) setRunners(r.data);
        if (tData) {
          const t = tData as ApiResponse<TaskEntry[]>;
          if (t.ok && t.data) {
            const sorted = [...t.data].sort((a, b) => a.phase - b.phase);
            setNextTasks(sorted.slice(0, 5));
          }
        }
        if (sData) {
          const s = sData as ApiResponse<{ paused: boolean }>;
          if (s.ok && s.data) setPaused(s.data.paused);
        }
        if (wizData) {
          const wiz = wizData as ApiResponse<{ has_completed_wizard: boolean }>;
          if (wiz.ok && wiz.data) setWizardDone(wiz.data.has_completed_wizard);
        }
        if (preData) {
          const pre = preData as ApiResponse<{ canPlan: boolean; reasons: string[]; activeObjectives: { id: string; title: string; priority: number }[] }>;
          if (pre.ok && pre.data) {
            setCanPlan(pre.data.canPlan);
            setActiveObjectives(pre.data.activeObjectives || []);
            if (!pre.data.canPlan) {
              const reasonMap: Record<string, string> = {
                wizard_not_completed: "Completa la configuracion inicial",
                no_active_objectives: "No hay objetivos activos",
                missing_required_requests: "Faltan datos de configuracion",
              };
              setPlanBlockReason(pre.data.reasons.map((r: string) => reasonMap[r] ?? r).join(". "));
            }
          }
        }
        if (vmData) {
          const vm = vmData as ApiResponse<{ vm_status: string; configured: boolean }>;
          if (vm.ok && vm.data) {
            setVmStatus(vm.data.vm_status);
            setVmConfigured(vm.data.configured);
          }
        }
        if (dData && runsData) {
          const dirs = (dData as ApiResponse<{ status: string }[]>).data ?? [];
          const runs = (runsData as ApiResponse<{ status: string }[]>).data ?? [];
          const tasks = m.ok && m.data ? m.data.tasks : { done: 0, ready: 0, running: 0, blocked: 0, failed: 0 };
          setChecklist({
            hasPlan: dirs.length > 0,
            hasApproved: dirs.some((d) => d.status === "APPROVED" || d.status === "APPLIED"),
            hasDoneTask: tasks.done > 0,
            hasSuccessRun: runs.some((r) => r.status === "done"),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOp]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) return <div className="p-8 text-slate-500">Cargando...</div>;
  if (!metrics) return <div className="p-8 text-red-400">Error cargando datos</div>;

  const onlineRunners = runners.filter((r) => r.status === "online");
  const failRate = metrics.runs.fail_rate_last_20;
  const label = (key: string) => (isOp ? OPERATOR_STAT_LABELS[key] ?? key : key);

  const runGpt = async () => {
    setGptRunning(true);
    setActionMsg(null);
    try {
      const res = await apiFetch("/api/ops/gpt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMsg({ type: "ok", text: "Plan generado. Revisalo en Planes." });
      } else {
        const msg = res.status === 401 ? "No autorizado: falta token" : data.error ?? `Error ${res.status}`;
        setActionMsg({ type: "error", text: msg });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error de conexion";
      setActionMsg({ type: "error", text: msg });
    } finally {
      setGptRunning(false);
    }
  };

  const togglePause = async () => {
    setPauseLoading(true);
    setActionMsg(null);
    try {
      const endpoint = paused ? "/api/ops/system/resume" : "/api/ops/system/pause";
      const res = await apiFetch(endpoint, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPaused(!paused);
        setActionMsg({ type: "ok", text: paused ? "Sistema reanudado" : "Sistema pausado" });
      } else {
        setActionMsg({ type: "error", text: data.error ?? "Error" });
      }
    } catch {
      setActionMsg({ type: "error", text: "Error de conexion" });
    } finally {
      setPauseLoading(false);
    }
  };

  const vmAction = async (action: "start" | "stop" | "reset") => {
    setVmLoading(true);
    setActionMsg(null);
    const isStart = action === "start" || action === "reset";

    setVmProgress({ step: "Enviando comando...", pct: 5 });
    try {
      const res = await apiFetch(`/api/ops/runner/vm/${action}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setActionMsg({ type: "error", text: data.error ?? "Error" });
        setVmProgress(null);
        setVmLoading(false);
        return;
      }
    } catch {
      setActionMsg({ type: "error", text: "Error de conexion" });
      setVmProgress(null);
      setVmLoading(false);
      return;
    }

    setVmProgress({ step: isStart ? "Esperando que la VM arranque..." : "Esperando que la VM se apague...", pct: 15 });
    const targetVmStatus = isStart ? "running" : "terminated";
    const maxPolls = 30;
    let polls = 0;
    let vmReady = false;

    while (polls < maxPolls) {
      await new Promise((r) => setTimeout(r, 3000));
      polls++;
      const pct = Math.min(15 + Math.round((polls / maxPolls) * 50), 65);
      try {
        const vmRes = await apiFetch("/api/ops/runner/vm");
        const vmData = (await vmRes.json()) as ApiResponse<{ vm_status: string }>;
        if (vmData.ok && vmData.data) {
          const st = vmData.data.vm_status;
          setVmStatus(st);
          if (st === targetVmStatus) { vmReady = true; break; }
          const vmLabels: Record<string, string> = {
            staging: "VM iniciando el sistema operativo...",
            running: "VM encendida",
            stopping: "VM cerrando procesos...",
            terminated: "VM apagada",
            suspended: "VM suspendida",
          };
          setVmProgress({ step: vmLabels[st] ?? `VM: ${st}`, pct });
        }
      } catch { /* retry */ }
    }

    if (!vmReady) {
      setVmProgress(null);
      setActionMsg({ type: "error", text: "Timeout esperando la VM. Revisa en unos minutos." });
      setVmLoading(false);
      fetchAll();
      return;
    }

    if (isStart) {
      setVmProgress({ step: "VM lista. Esperando que el agente arranque...", pct: 70 });
      let runnerOnline = false;
      const maxRunnerPolls = 20;
      let rPolls = 0;
      while (rPolls < maxRunnerPolls) {
        await new Promise((r) => setTimeout(r, 3000));
        rPolls++;
        const pct = Math.min(70 + Math.round((rPolls / maxRunnerPolls) * 25), 95);
        try {
          const rRes = await apiFetch("/api/ops/runner/status");
          const rData = (await rRes.json()) as ApiResponse<Runner[]>;
          if (rData.ok && rData.data) {
            setRunners(rData.data);
            if (rData.data.some((r) => r.status === "online")) { runnerOnline = true; break; }
          }
          setVmProgress({ step: "Agente iniciando servicios...", pct });
        } catch { /* ignore */ }
      }
      setVmProgress(runnerOnline
        ? { step: "Agente online. Todo listo.", pct: 100 }
        : { step: "VM lista pero el agente tarda en responder.", pct: 95 });
    } else {
      setVmProgress({ step: "VM apagada correctamente.", pct: 100 });
    }

    setTimeout(() => { setVmProgress(null); setVmLoading(false); fetchAll(); }, 3000);
  };

  const refresh = () => {
    setActionMsg(null);
    setLoading(true);
    fetchAll();
    setActionMsg({ type: "ok", text: "Actualizado" });
    setTimeout(() => setActionMsg(null), 2000);
  };

  // =====================
  // OPERATOR MODE
  // =====================
  if (isOp) {
    return (
      <PageContainer maxWidth="lg">
        <HeroPanel
          title="Centro de Control"
          subtitle="Vista general del sistema"
          actions={
            <>
              <Tooltip2026 text={!canPlan ? planBlockReason : "La IA analiza el sistema y propone mejoras"}>
                <GlowButton
                  onClick={runGpt}
                  disabled={gptRunning || !canPlan}
                  variant="primary"
                >
                  {gptRunning ? "Generando..." : "Generar plan"}
                </GlowButton>
              </Tooltip2026>
              <Tooltip2026 text={paused ? "Reanudar la ejecucion de tareas" : "Detener temporalmente todas las tareas"}>
                <GlowButton
                  onClick={togglePause}
                  disabled={pauseLoading}
                  variant={paused ? "danger" : "secondary"}
                >
                  {pauseLoading ? "..." : paused ? "Reanudar" : "Pausar"}
                </GlowButton>
              </Tooltip2026>
              <GlowButton onClick={refresh} variant="ghost">
                Actualizar
              </GlowButton>
            </>
          }
        />

        {/* Action feedback */}
        {actionMsg && (
          <div className={`mb-6 text-sm px-4 py-2 rounded-card ${
            actionMsg.type === "ok" ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
          }`}>
            {actionMsg.text}
          </div>
        )}

        {/* Wizard banner */}
        {wizardDone === false && (
          <GlassCard glow="primary" className="mb-6">
            <h3 className="text-lg font-semibold mb-1 text-white">Para empezar, necesitamos conocer tu negocio</h3>
            <p className="text-sm text-slate-400 mb-4">
              Completa una configuracion rapida para que el sistema sepa que hacer.
            </p>
            <a href="#/strategy-wizard">
              <GlowButton variant="primary">Definir estrategia</GlowButton>
            </a>
          </GlassCard>
        )}

        {/* Runner / VM status alert */}
        {onlineRunners.length === 0 && !vmProgress && (
          <GlassCard glow="error" className="mb-6">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
              <span className="text-red-200 font-medium flex-1">
                {vmConfigured && vmStatus !== "running"
                  ? "VM apagada — el agente no puede correr"
                  : "Agente offline — no se ejecutan tareas"}
              </span>
              {vmConfigured && !vmLoading && (
                vmStatus !== "running" ? (
                  <GlowButton onClick={() => vmAction("start")} variant="secondary" size="sm">
                    Prender
                  </GlowButton>
                ) : (
                  <GlowButton onClick={() => vmAction("reset")} variant="secondary" size="sm">
                    Reiniciar
                  </GlowButton>
                )
              )}
            </div>
          </GlassCard>
        )}

        {/* 4 key stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <AnimatedFadeIn delay={0}>
            <MetricCard label="Pendientes" value={metrics.tasks.ready} color="text-blue-400" />
          </AnimatedFadeIn>
          <AnimatedFadeIn delay={50}>
            <MetricCard label="En curso" value={metrics.tasks.running} color="text-yellow-400" />
          </AnimatedFadeIn>
          <AnimatedFadeIn delay={100}>
            <MetricCard
              label="Necesitan config"
              value={metrics.tasks.blocked}
              color={metrics.tasks.blocked > 0 ? "text-red-400" : "text-slate-500"}
              glow={metrics.tasks.blocked > 0 ? "error" : "none"}
            />
          </AnimatedFadeIn>
          <AnimatedFadeIn delay={150}>
            <MetricCard
              label="Agente"
              value={onlineRunners.length > 0 ? "Activo" : "Apagado"}
              color={onlineRunners.length > 0 ? "text-green-400" : "text-red-400"}
              glow={onlineRunners.length > 0 ? "success" : "error"}
            />
          </AnimatedFadeIn>
        </div>

        {/* Blocked → link to configuration */}
        {metrics.tasks.blocked > 0 && (
          <GlassCard glow="warning" className="mb-6">
            <span className="text-yellow-300 text-sm">
              Hay {metrics.tasks.blocked} tarea(s) que necesitan datos para avanzar.
            </span>
            <a href="#/requests" className="text-sm text-blue-400 hover:text-blue-300 ml-2 transition-colors">
              Ir a Configuracion
            </a>
          </GlassCard>
        )}

        {/* Checklist: Como empezar */}
        <GlassCard className="mb-8">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Como empezar</h3>
          <div className="space-y-2.5">
            {[
              { done: checklist.hasPlan, label: "Generar plan", sub: "Crear una propuesta con el boton de arriba" },
              { done: checklist.hasApproved, label: "Aprobar plan", sub: "Revisar y aprobar en Planes" },
              { done: checklist.hasDoneTask, label: "Esperar ejecucion", sub: "El sistema trabaja solo" },
              { done: checklist.hasSuccessRun, label: "Revisar resultados", sub: "Ver que cambio en Ejecuciones" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 ${
                  step.done
                    ? "text-green-400"
                    : "bg-elevated text-slate-600"
                }`}
                  style={step.done ? { background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(6,182,212,0.15))" } : undefined}
                >
                  {step.done ? "\u2713" : (i + 1)}
                </span>
                <div>
                  <span className={`text-sm ${step.done ? "text-green-400 line-through" : "text-slate-200"}`}>{step.label}</span>
                  {!step.done && <p className="text-xs text-slate-500">{step.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Objetivos activos */}
        {activeObjectives.length > 0 && (
          <SectionBlock title="Objetivos activos">
            <div className="space-y-2">
              {activeObjectives.map((obj) => (
                <GlassCard key={obj.id} hover className="!p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-sm text-slate-200 flex-1">{obj.title}</span>
                    <span className="text-xs text-slate-600">P{obj.priority}</span>
                  </div>
                </GlassCard>
              ))}
            </div>
            <a href="#/objectives" className="text-xs text-accent-primary hover:text-indigo-300 mt-3 inline-block transition-colors">
              Ver todos los objetivos
            </a>
          </SectionBlock>
        )}

        {/* Lo proximo */}
        <SectionBlock title="Lo proximo">
          {nextTasks.length === 0 ? (
            <p className="text-slate-500 text-sm">No hay tareas pendientes.</p>
          ) : (
            <div className="space-y-2">
              {nextTasks.map((t) => (
                <GlassCard key={t.id} hover className="!p-3">
                  <div className="flex items-center gap-3">
                    <StatusPill status="ready" label="Pendiente" />
                    <span className="text-sm text-slate-200 flex-1 truncate">{t.title}</span>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
          {nextTasks.length > 0 && (
            <a href="#/tasks" className="text-xs text-accent-primary hover:text-indigo-300 mt-3 inline-block transition-colors">
              Ver todas las tareas
            </a>
          )}
        </SectionBlock>

        {/* Agente + VM control */}
        <SectionBlock title="Agente">
          {/* Progress bar */}
          {vmProgress && (
            <GlassCard className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-200">{vmProgress.step}</span>
                <span className="text-xs text-slate-500">{vmProgress.pct}%</span>
              </div>
              <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${vmProgress.pct}%`,
                    background: vmProgress.pct === 100
                      ? "linear-gradient(90deg, #22C55E, #06B6D4)"
                      : "linear-gradient(90deg, #6366F1, #8B5CF6)",
                  }}
                />
              </div>
            </GlassCard>
          )}

          {/* VM control bar */}
          {vmConfigured && !vmProgress && (
            <GlassCard className="mb-3 !p-3">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${vmStatus === "running" ? "bg-green-400" : vmStatus === "staging" || vmStatus === "stopping" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />
                <span className="text-sm text-slate-200 flex-1">
                  VM {vmStatus === "running" ? "encendida" : vmStatus === "terminated" || vmStatus === "stopped" ? "apagada" : vmStatus ?? "?"}
                </span>
                <div className="flex gap-2">
                  {vmStatus === "running" ? (
                    <>
                      <GlowButton onClick={() => vmAction("reset")} disabled={vmLoading} variant="secondary" size="sm">Reiniciar</GlowButton>
                      <GlowButton onClick={() => vmAction("stop")} disabled={vmLoading} variant="danger" size="sm">Apagar</GlowButton>
                    </>
                  ) : vmStatus === "terminated" || vmStatus === "stopped" ? (
                    <GlowButton onClick={() => vmAction("start")} disabled={vmLoading} variant="primary" size="sm">Prender</GlowButton>
                  ) : null}
                </div>
              </div>
            </GlassCard>
          )}

          {/* Runner heartbeats */}
          {runners.length > 0 && (
            <div className="space-y-2">
              {[...runners]
                .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
                .slice(0, 3)
                .map((r) => (
                  <GlassCard key={r.runner_id} className="!p-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full ${r.status === "online" ? "bg-green-400" : "bg-slate-600"}`} />
                      <span className="flex-1 text-slate-200">{humanizeRunnerName(r.runner_id, r.meta?.hostname)}</span>
                      <StatusPill status={r.status} label={humanizeRunnerStatus(r.status, r.last_seen_at)} />
                    </div>
                  </GlassCard>
                ))}
            </div>
          )}

          {!vmConfigured && runners.length === 0 && (
            <p className="text-sm text-slate-500">Sin agentes registrados.</p>
          )}
        </SectionBlock>
      </PageContainer>
    );
  }

  // =====================
  // TECHNICAL MODE
  // =====================
  return (
    <PageContainer maxWidth="xl">
      <HeroPanel title="Dashboard" subtitle="System metrics and runner status" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <AnimatedFadeIn delay={0}><MetricCard label={label("Tasks Ready")} value={metrics.tasks.ready} color="text-blue-400" /></AnimatedFadeIn>
        <AnimatedFadeIn delay={30}><MetricCard label={label("Tasks Running")} value={metrics.tasks.running} color="text-yellow-400" /></AnimatedFadeIn>
        <AnimatedFadeIn delay={60}><MetricCard label={label("Tasks Done")} value={metrics.tasks.done} color="text-green-400" /></AnimatedFadeIn>
        <AnimatedFadeIn delay={90}><MetricCard label={label("Tasks Failed")} value={metrics.tasks.failed} color={metrics.tasks.failed > 0 ? "text-red-400" : "text-slate-500"} /></AnimatedFadeIn>
        <AnimatedFadeIn delay={120}>
          <MetricCard
            label={label("Runners")}
            value={`${onlineRunners.length} / ${runners.length}`}
            color={onlineRunners.length > 0 ? "text-green-400" : "text-red-400"}
            sub={onlineRunners.length > 0 ? "online" : "todos offline"}
          />
        </AnimatedFadeIn>
        <AnimatedFadeIn delay={150}>
          <MetricCard
            label={label("Runs (24h)")}
            value={metrics.runs.last_24h}
            sub={metrics.runs.fails_last_24h > 0 ? `${metrics.runs.fails_last_24h} failed` : undefined}
          />
        </AnimatedFadeIn>
        <AnimatedFadeIn delay={180}>
          <MetricCard
            label={label("Fail Rate")}
            value={failRate != null ? `${(failRate * 100).toFixed(0)}%` : "-"}
            color={failRate != null && failRate > 0.2 ? "text-red-400" : "text-green-400"}
            sub="ultimos 20 runs"
          />
        </AnimatedFadeIn>
        <AnimatedFadeIn delay={210}><MetricCard label={label("Avg Duration")} value={formatAge(metrics.runs.avg_ready_to_done_seconds_last_20)} sub="ready -> done" /></AnimatedFadeIn>
        <AnimatedFadeIn delay={240}>
          <MetricCard
            label={label("Backlog Age")}
            value={formatAge(metrics.backlog.oldest_ready_age_seconds)}
            color={metrics.backlog.oldest_ready_age_seconds && metrics.backlog.oldest_ready_age_seconds > 86400 ? "text-yellow-400" : "text-slate-300"}
            sub="task mas vieja"
          />
        </AnimatedFadeIn>
        <AnimatedFadeIn delay={270}>
          <MetricCard label={label("Deduped")} value={metrics.runs.deduped_total} sub={metrics.runs.deduped_last_24h > 0 ? `${metrics.runs.deduped_last_24h} hoy` : undefined} color="text-slate-400" />
        </AnimatedFadeIn>
      </div>

      {/* Runners detail */}
      <SectionBlock title="Runners">
        {runners.length === 0 ? (
          <p className="text-slate-500 text-sm">Sin runners registrados.</p>
        ) : (
          <div className="space-y-2">
            {runners.map((r) => (
              <GlassCard key={r.runner_id} className="!p-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${r.status === "online" ? "bg-green-400" : "bg-slate-600"}`} />
                  <span className="font-mono text-slate-300 flex-1">{r.runner_id}</span>
                  {r.meta?.hostname && <span className="text-slate-500">{r.meta.hostname}</span>}
                  <span className="text-xs text-slate-500">{new Date(r.last_seen_at).toLocaleString("es-AR")}</span>
                  <StatusPill status={r.status} />
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </SectionBlock>

      {metrics.runs.last_run_at && (
        <div className="text-xs text-slate-600 mt-4">
          Ultimo run: {new Date(metrics.runs.last_run_at).toLocaleString("es-AR")}
        </div>
      )}
    </PageContainer>
  );
}
