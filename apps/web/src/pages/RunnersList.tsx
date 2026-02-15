import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import {
  PageContainer,
  GlassCard,
  StatusPill,
  HeroPanel,
  AnimatedFadeIn,
} from "../ui2026";

interface RunnerHeartbeat {
  id: string;
  runner_id: string;
  status: "online" | "offline";
  last_seen_at: string;
  meta?: Record<string, unknown>;
}

export function RunnersList() {
  const [runners, setRunners] = useState<RunnerHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRunners = () => {
    apiFetch("/api/ops/runner/status")
      .then((r) => r.json())
      .then((data: ApiResponse<RunnerHeartbeat[]>) => {
        if (data.ok && data.data) {
          setRunners(data.data);
          setError(null);
        } else {
          setError(data.error ?? "Error desconocido");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRunners();
    const interval = setInterval(fetchRunners, 15000); // Auto-refresh cada 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <PageContainer maxWidth="lg">
        <div className="text-slate-400">Cargando runners...</div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="lg">
        <GlassCard glow="error">
          <div className="text-red-400">Error: {error}</div>
        </GlassCard>
      </PageContainer>
    );
  }

  const onlineCount = runners.filter((r) => r.status === "online").length;

  return (
    <PageContainer maxWidth="lg">
      <HeroPanel
        title="Runners"
        subtitle={`${onlineCount} online / ${runners.length} total`}
      />

      {runners.length === 0 && (
        <div className="text-slate-500 text-center py-12">
          No hay runners registrados
        </div>
      )}

      <div className="space-y-2">
        {runners.map((runner, i) => {
          const lastSeen = new Date(runner.last_seen_at);
          const ago = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
          const agoText =
            ago < 60
              ? `${ago}s`
              : ago < 3600
              ? `${Math.floor(ago / 60)}m`
              : `${Math.floor(ago / 3600)}h`;

          return (
            <AnimatedFadeIn key={runner.id} delay={i * 50}>
              <GlassCard hover className="!p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        runner.status === "online"
                          ? "bg-green-500 animate-pulse"
                          : "bg-slate-600"
                      }`}
                    />
                    <div>
                      <div className="font-mono text-sm text-white">
                        {runner.runner_id}
                      </div>
                      <div className="text-xs text-slate-500">
                        Last seen: {agoText} ago
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {runner.meta && Object.keys(runner.meta).length > 0 && (
                      <div className="text-xs text-slate-500">
                        {runner.meta.hostname ? `@${String(runner.meta.hostname)}` : null}
                      </div>
                    )}
                    <StatusPill
                      status={runner.status}
                      label={runner.status.toUpperCase()}
                      size="sm"
                      pulse={runner.status === "online"}
                    />
                  </div>
                </div>
              </GlassCard>
            </AnimatedFadeIn>
          );
        })}
      </div>
    </PageContainer>
  );
}
