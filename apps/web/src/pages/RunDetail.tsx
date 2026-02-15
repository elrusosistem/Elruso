import { useEffect, useState } from "react";
import type { ApiResponse, RunDetail as RunDetailType, FileChange } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeRunStatus } from "../humanize";
import {
  PageContainer, GlassCard, GlowButton, StatusPill,
  SectionBlock, AnimatedFadeIn, ConsoleBlock2026,
} from "../ui2026";

export function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [showPatch, setShowPatch] = useState(false);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    apiFetch(`/api/runs/${runId}`)
      .then((r) => r.json())
      .then((data: ApiResponse<RunDetailType>) => {
        if (data.ok && data.data) {
          setRun(data.data);
        } else {
          setError(data.error ?? "Run no encontrado");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="p-8 text-slate-500">Cargando...</div>;
  if (error || !run) {
    return (
      <PageContainer maxWidth="lg">
        <a href="#/runs" className="text-accent-primary hover:text-indigo-300 text-sm mb-4 inline-block transition-colors">
          &larr; Volver
        </a>
        <GlassCard glow="error">
          <span className="text-red-300">{error ?? "Run no encontrado"}</span>
        </GlassCard>
      </PageContainer>
    );
  }

  const statusForPill = isOp
    ? (run.status === "done" ? "done" : run.status === "failed" ? "failed" : run.status)
    : run.status;

  const statusLabel = isOp
    ? (run.status === "done" ? "Resultado: OK" : run.status === "failed" ? "Resultado: Fallo" : humanizeRunStatus(run.status))
    : run.status;

  return (
    <PageContainer maxWidth="lg">
      <a href="#/runs" className="text-accent-primary hover:text-indigo-300 text-sm mb-4 inline-block transition-colors">
        &larr; {isOp ? "Volver a ejecuciones" : "Volver"}
      </a>

      {/* Header */}
      <AnimatedFadeIn>
        <GlassCard className="mb-8">
          <h2 className="text-2xl font-bold mb-3 text-white">
            {isOp ? `Ejecucion de ${run.task_id}` : run.task_id}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusPill
              status={statusForPill}
              label={statusLabel}
              pulse={run.status === "running"}
            />
            {!isOp && run.branch && (
              <span className="px-2 py-0.5 bg-elevated rounded-md text-slate-300 text-xs">
                {run.branch}
              </span>
            )}
            {!isOp && run.commit_hash && (
              <span className="font-mono text-slate-400 text-xs">
                {run.commit_hash.slice(0, 8)}
              </span>
            )}
            <span className="text-slate-500 text-xs">
              {new Date(run.started_at).toLocaleString("es-AR")}
            </span>
            {run.finished_at && (
              <span className="text-slate-500 text-xs">
                &rarr; {new Date(run.finished_at).toLocaleString("es-AR")}
              </span>
            )}
          </div>
          {run.pr_url && (
            <a
              href={run.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:text-indigo-300 text-sm mt-3 inline-block transition-colors"
            >
              Ver PR
            </a>
          )}
          {run.summary && (
            <p className="mt-3 text-slate-300 bg-elevated rounded-card p-3 text-sm">
              {run.summary}
            </p>
          )}
        </GlassCard>
      </AnimatedFadeIn>

      {/* Steps — hide in operator mode */}
      {!isOp && (
        <SectionBlock title={`Steps (${run.steps.length})`}>
          {run.steps.length === 0 ? (
            <p className="text-slate-500 text-sm">Sin steps registrados.</p>
          ) : (
            <div className="space-y-2">
              {run.steps.map((step, i) => (
                <AnimatedFadeIn key={step.id} delay={i * 30}>
                  <GlassCard className="!p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-slate-200">{step.step_name}</span>
                      {step.exit_code !== null && (
                        <StatusPill
                          status={step.exit_code === 0 ? "done" : "failed"}
                          label={`exit ${step.exit_code}`}
                        />
                      )}
                    </div>
                    {step.cmd && (
                      <code className="text-xs text-slate-400 block mb-1">
                        $ {step.cmd}
                      </code>
                    )}
                    {step.output_excerpt && (
                      <ConsoleBlock2026
                        content={step.output_excerpt}
                        maxHeight="160px"
                        className="mt-1"
                      />
                    )}
                  </GlassCard>
                </AnimatedFadeIn>
              ))}
            </div>
          )}
        </SectionBlock>
      )}

      {/* File Changes */}
      <SectionBlock title={isOp ? `Que cambio (${run.file_changes.length})` : `Archivos (${run.file_changes.length})`}>
        {run.file_changes.length === 0 ? (
          <p className="text-slate-500 text-sm">
            {isOp ? "Sin cambios registrados." : "Sin cambios de archivos registrados."}
          </p>
        ) : (
          <GlassCard className="!p-0 divide-y divide-[rgba(148,163,184,0.06)]">
            {run.file_changes.map((fc) => {
              const changeLabel = isOp
                ? { added: "Nuevo", deleted: "Eliminado", renamed: "Renombrado", modified: "Modificado" }[fc.change_type] ?? fc.change_type
                : fc.change_type[0].toUpperCase();

              const changeStatus = fc.change_type === "added"
                ? "done"
                : fc.change_type === "deleted"
                  ? "failed"
                  : fc.change_type === "renamed"
                    ? "ready"
                    : "running";

              return (
                <div key={fc.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusPill
                      status={changeStatus}
                      label={changeLabel}
                    />
                    <span className={`${isOp ? "text-slate-300" : "font-mono text-slate-300"} truncate`}>
                      {isOp ? fc.path.split("/").pop() : fc.path}
                    </span>
                  </div>
                  {!isOp && fc.diffstat && (
                    <pre className="text-xs text-slate-500 mt-1 ml-8 whitespace-pre-wrap">{fc.diffstat}</pre>
                  )}
                </div>
              );
            })}
          </GlassCard>
        )}
      </SectionBlock>

      {/* Patch Forense — technical only by default, operator can toggle */}
      {run.artifact_path && (
        <SectionBlock
          title={isOp ? "Detalle tecnico" : "Patch Forense"}
          actions={
            <GlowButton
              onClick={() => {
                if (showPatch) {
                  setShowPatch(false);
                } else {
                  apiFetch(`/api/runs/${runId}/artifacts/patch`)
                    .then((r) => r.json())
                    .then((data: ApiResponse<{ patch: string }>) => {
                      if (data.ok && data.data) {
                        setPatch(data.data.patch);
                        setShowPatch(true);
                      }
                    })
                    .catch(() => setPatch("Error cargando patch"));
                }
              }}
              variant="secondary"
              size="sm"
            >
              {showPatch ? "Ocultar" : isOp ? "Ver detalles tecnicos" : "Ver patch redacted"}
            </GlowButton>
          }
        >
          {showPatch && patch && (
            <ConsoleBlock2026
              title="Patch"
              content={patch}
              maxHeight="384px"
            />
          )}
        </SectionBlock>
        )}
    </PageContainer>
  );
}
