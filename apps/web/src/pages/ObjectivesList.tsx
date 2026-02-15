import { useEffect, useState } from "react";
import type { ApiResponse, Objective } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import {
  PageContainer, GlassCard, GlowButton, StatusPill,
  SectionBlock, HeroPanel, AnimatedFadeIn,
} from "../ui2026";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  done: "Completado",
};

export function ObjectivesList() {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchObjectives = () => {
    apiFetch("/api/ops/objectives")
      .then((r) => r.json())
      .then((data: ApiResponse<Objective[]>) => {
        if (data.ok && data.data) setObjectives(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchObjectives();
  }, []);

  const activate = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}/activate`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo activado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  const pause = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}/pause`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo pausado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  const complete = async (id: string) => {
    const res = await apiFetch(`/api/ops/objectives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const data = await res.json();
    if (data.ok) {
      setMessage({ type: "ok", text: "Objetivo completado" });
      fetchObjectives();
    } else {
      setMessage({ type: "error", text: data.error ?? "Error" });
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Cargando objetivos...</div>;

  // Group by status: active first, then draft, paused, done
  const order = ["active", "draft", "paused", "done"];
  const sorted = [...objectives].sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  );

  const activeCount = objectives.filter((o) => o.status === "active").length;

  return (
    <PageContainer maxWidth="lg">
      <HeroPanel
        title="Objetivos"
        subtitle={
          isOp
            ? "Las metas de tu negocio. El sistema genera planes alineados a estos objetivos."
            : "Objectives scope GPT planning. Active objectives are included in the compose prompt."
        }
      />

      {/* Action feedback */}
      {message && (
        <div
          className={`mb-6 text-sm px-4 py-2 rounded-card ${
            message.type === "ok" ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
          }`}
        >
          {message.text}
        </div>
      )}

      {objectives.length === 0 ? (
        <AnimatedFadeIn>
          <GlassCard glow="primary" className="text-center">
            <p className="text-slate-400 mb-4">
              {isOp
                ? "No hay objetivos definidos. Completa el wizard para crear tu primer objetivo."
                : "No objectives. Complete the strategy wizard to create one."}
            </p>
            <a href="#/strategy-wizard">
              <GlowButton variant="primary">Definir estrategia</GlowButton>
            </a>
          </GlassCard>
        </AnimatedFadeIn>
      ) : (
        <SectionBlock>
          <div className="space-y-3">
            {sorted.map((obj, i) => (
              <AnimatedFadeIn key={obj.id} delay={i * 40}>
                <GlassCard hover className="!p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-medium text-white truncate">
                          {obj.title}
                        </h3>
                        <StatusPill
                          status={obj.status}
                          label={STATUS_LABELS[obj.status] ?? obj.status}
                          pulse={obj.status === "active"}
                        />
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full font-medium">
                          {obj.profile}
                        </span>
                      </div>
                      {obj.description && (
                        <p className="text-xs text-slate-400 mb-2">
                          {obj.description}
                        </p>
                      )}
                      {!isOp && (
                        <div className="text-xs text-slate-600">
                          ID: {obj.id} | P{obj.priority} |{" "}
                          {new Date(obj.created_at).toLocaleString("es-AR")}
                          {obj.last_reviewed_at && (
                            <> | Revisado: {new Date(obj.last_reviewed_at).toLocaleString("es-AR")}</>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {obj.status === "draft" && (
                        <GlowButton onClick={() => activate(obj.id)} variant="primary" size="sm">
                          Activar
                        </GlowButton>
                      )}
                      {obj.status === "active" && (
                        <>
                          <GlowButton onClick={() => pause(obj.id)} variant="secondary" size="sm">
                            Pausar
                          </GlowButton>
                          <GlowButton onClick={() => complete(obj.id)} variant="ghost" size="sm">
                            Completar
                          </GlowButton>
                        </>
                      )}
                      {obj.status === "paused" && (
                        <GlowButton onClick={() => activate(obj.id)} variant="primary" size="sm">
                          Reactivar
                        </GlowButton>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </AnimatedFadeIn>
            ))}
          </div>
        </SectionBlock>
      )}

      {activeCount > 0 && (
        <div className="mt-4 text-xs text-slate-500">
          {activeCount} objetivo(s) activo(s) — el sistema genera planes alineados a estos.
        </div>
      )}
    </PageContainer>
  );
}
