import { useEffect, useState } from "react";
import type { ApiResponse, RunLog } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeRunStatus, formatTimeAgo } from "../humanize";
import {
  PageContainer,
  GlassCard,
  StatusPill,
  HeroPanel,
  AnimatedFadeIn,
} from "../ui2026";

export function RunsList() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    apiFetch("/api/runs")
      .then((r) => r.json())
      .then((data: ApiResponse<RunLog[]>) => {
        if (data.ok && data.data) {
          setRuns(data.data);
        } else {
          setError(data.error ?? "Error cargando runs");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageContainer maxWidth="lg">
        <div className="text-slate-400">Cargando ejecuciones...</div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="lg">
        <GlassCard glow="error">
          <div className="text-red-300">{error}</div>
        </GlassCard>
      </PageContainer>
    );
  }

  if (runs.length === 0) {
    return (
      <PageContainer maxWidth="lg">
        <HeroPanel title={isOp ? "Ejecuciones" : "Runs"} />
        <div className="text-slate-500 text-center py-12">
          No hay ejecuciones registradas todavia.
        </div>
      </PageContainer>
    );
  }

  return (
    <div data-tour="runs-list">
    <PageContainer maxWidth="lg">
      <HeroPanel
        title={isOp ? "Ejecuciones" : "Runs"}
        subtitle={`${runs.length} ejecuci${runs.length === 1 ? "on" : "ones"} registrada${runs.length === 1 ? "" : "s"}`}
      />

      <div className="space-y-2">
        {runs.map((run, i) => (
          <AnimatedFadeIn key={run.id} delay={i * 40}>
            <a href={`#/runs/${run.id}`} className="block">
              <GlassCard hover className="!p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">
                      {run.task_id}
                    </div>
                    <div className="text-sm text-slate-400">
                      {run.branch && !isOp && (
                        <span className="mr-3">{run.branch}</span>
                      )}
                      {isOp
                        ? formatTimeAgo(run.started_at)
                        : new Date(run.started_at).toLocaleString("es-AR")}
                    </div>
                  </div>
                  {run.artifact_path && (
                    <StatusPill
                      status="draft"
                      label={isOp ? "Cambios" : "PATCH"}
                      size="sm"
                    />
                  )}
                  <StatusPill
                    status={run.status}
                    label={isOp ? humanizeRunStatus(run.status) : run.status}
                    size="sm"
                    pulse={run.status === "running"}
                  />
                </div>
              </GlassCard>
            </a>
          </AnimatedFadeIn>
        ))}
      </div>
    </PageContainer>
    </div>
  );
}
