import { useState, useEffect, useMemo } from "react";
import type { ApiResponse, Objective, WizardState } from "@elruso/types";
import { apiFetch } from "../api";
import { humanizeProfileId } from "../humanize";
import {
  PageContainer,
  GlassCard,
  GlowButton,
  AnimatedFadeIn,
} from "../ui2026";

interface StepDef {
  key: string;
  title: string;
  subtitle: string;
  placeholder?: string;
  type: "textarea" | "radio";
  options?: { value: string; label: string; desc: string }[];
}

const BASE_STEPS: StepDef[] = [
  {
    key: "what_to_achieve",
    title: "Contanos que queres lograr",
    subtitle: "No necesitas ser tecnico. Simplemente describi tu objetivo con tus palabras.",
    placeholder: "Ej: Quiero vender mas online, quiero automatizar mis publicaciones, quiero conectar mi tienda con otros canales...",
    type: "textarea" as const,
  },
  {
    key: "how_today",
    title: "Como lo manejas hoy?",
    subtitle: "Contanos como gestionas tu negocio actualmente. Esto nos ayuda a entender desde donde partimos.",
    placeholder: "Ej: Hago todo manual, uso Excel, tengo Tiendanube pero no le saco provecho...",
    type: "textarea" as const,
  },
  {
    key: "tech_level",
    title: "Que tan comodo te sentis con la tecnologia?",
    subtitle: "No hay respuesta correcta. Esto nos ayuda a adaptar el nivel de detalle.",
    type: "radio" as const,
    options: [
      { value: "none", label: "Prefiero no tocar nada tecnico", desc: "Solo quiero que funcione" },
      { value: "basic", label: "Entiendo lo basico", desc: "Puedo seguir instrucciones paso a paso" },
      { value: "intermediate", label: "Me defiendo bien", desc: "Puedo configurar herramientas y buscar soluciones" },
      { value: "technical", label: "Soy tecnico", desc: "Se programar o administrar sistemas" },
    ],
  },
  {
    key: "current_stack",
    title: "Que plataforma usas para tu negocio?",
    subtitle: "Contanos que herramientas usas. Esto determina que integraciones activamos.",
    placeholder: "Ej: Tiendanube, Mercado Libre, Instagram, Excel...",
    type: "textarea" as const,
  },
];

const WABA_STEPS: StepDef[] = [
  {
    key: "waba_goal",
    title: "Que queres lograr con WhatsApp?",
    subtitle: "Esto nos ayuda a priorizar la configuracion del canal.",
    type: "radio" as const,
    options: [
      { value: "ventas", label: "Ventas", desc: "Recibir pedidos y cerrar ventas por WhatsApp" },
      { value: "soporte", label: "Soporte", desc: "Atender consultas y reclamos de clientes" },
      { value: "cobranzas", label: "Cobranzas", desc: "Enviar recordatorios de pago y cobrar" },
      { value: "notificaciones", label: "Notificaciones", desc: "Enviar avisos, confirmaciones y alertas" },
    ],
  },
  {
    key: "waba_readiness",
    title: "Ya tenes numero aprobado y plantillas o arrancas de cero?",
    subtitle: "Esto nos ayuda a estimar el setup necesario.",
    type: "radio" as const,
    options: [
      { value: "tengo_todo", label: "Tengo todo", desc: "Numero aprobado, plantillas y acceso a la API" },
      { value: "tengo_numero", label: "Tengo numero", desc: "Numero aprobado pero sin plantillas ni integracion" },
      { value: "desde_cero", label: "Desde cero", desc: "Todavia no tengo nada configurado en Meta" },
    ],
  },
];

type Phase = "loading" | "already_done" | "questions" | "summary" | "result";

export function StrategyWizard() {
  const [projectProfile, setProjectProfile] = useState<string>("open");
  const [wizardDone, setWizardDone] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("loading");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    missingRequests: boolean;
    message: string;
  } | null>(null);

  // Fetch wizard status + project profile on mount
  useEffect(() => {
    apiFetch("/api/ops/wizard/status")
      .then((r) => r.json())
      .then((data: ApiResponse<WizardState>) => {
        if (data.ok && data.data) {
          setProjectProfile(data.data.current_profile ?? "open");
          if (data.data.has_completed_wizard) {
            setWizardDone(true);
            setAnswers((data.data.answers ?? {}) as Record<string, string>);
            setPhase("already_done");
          } else {
            // Pre-fill answers if partially saved
            if (data.data.answers && Object.keys(data.data.answers).length > 0) {
              setAnswers(data.data.answers as Record<string, string>);
            }
            setPhase("questions");
          }
        } else {
          setPhase("questions");
        }
      })
      .catch(() => setPhase("questions"));
  }, []);

  const steps = useMemo(() => {
    const all: StepDef[] = [...BASE_STEPS];
    if (projectProfile === "waba") {
      all.push(...WABA_STEPS);
    }
    return all;
  }, [projectProfile]);

  const step = steps[currentStep];
  const totalSteps = steps.length;
  const canNext = !!answers[step?.key]?.trim();

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setPhase("summary");
    }
  };

  const handleBack = () => {
    if (phase === "summary") {
      setPhase("questions");
      return;
    }
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // 1. Save wizard answers (profile comes from project, not body)
      const wizardRes = await apiFetch("/api/ops/wizard/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          completed: true,
        }),
      });
      const wizardData = await wizardRes.json();

      if (!wizardData.ok) {
        setResult({
          success: false,
          missingRequests: false,
          message: wizardData.error ?? "Error guardando configuracion",
        });
        setPhase("result");
        return;
      }

      // 2. Create objective from answers
      const objRes = await apiFetch("/api/ops/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: answers.what_to_achieve?.trim() ?? "Objetivo principal",
          description: `Como lo hace hoy: ${answers.how_today ?? "—"}. Stack: ${answers.current_stack ?? "—"}`,
          profile: projectProfile,
        }),
      });
      const objData: ApiResponse<Objective> = await objRes.json();

      if (objData.ok && objData.data) {
        // 3. Activate the objective
        await apiFetch(`/api/ops/objectives/${objData.data.id}/activate`, {
          method: "POST",
        });
      }

      // Check if there are missing planning requests
      const requestsCreated =
        wizardData.data?.requests_created ?? [];

      if (requestsCreated.length > 0) {
        setResult({
          success: true,
          missingRequests: true,
          message: `Objetivo creado. Antes de generar un plan, necesitas configurar ${requestsCreated.length} dato(s).`,
        });
      } else {
        setResult({
          success: true,
          missingRequests: false,
          message: "Listo! Ya podes generar tu primer plan.",
        });
      }
      setPhase("result");
    } catch (e) {
      setResult({
        success: false,
        missingRequests: false,
        message: `Error: ${(e as Error).message}`,
      });
      setPhase("result");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ──
  if (phase === "loading") {
    return (
      <PageContainer maxWidth="sm">
        <div className="text-slate-400">Cargando...</div>
      </PageContainer>
    );
  }

  // ── Already completed: show summary ──
  if (phase === "already_done") {
    return (
      <PageContainer maxWidth="sm">
        <AnimatedFadeIn>
          <h2 className="text-2xl font-bold mb-2 text-white">Estrategia configurada</h2>
          <p className="text-sm text-slate-400 mb-6">
            Ya completaste la configuracion inicial para este proyecto.
          </p>

          <div className="space-y-3 mb-8">
            <GlassCard className="!p-4">
              <div className="text-xs text-slate-500 uppercase mb-1">Perfil</div>
              <div className="text-sm text-blue-400 font-medium">{humanizeProfileId(projectProfile)}</div>
            </GlassCard>
            {steps.map((s, i) => {
              const val = answers[s.key];
              if (!val) return null;
              return (
                <AnimatedFadeIn key={s.key} delay={i * 60}>
                  <GlassCard className="!p-4">
                    <div className="text-xs text-slate-500 uppercase mb-1">
                      {s.title.replace("?", "")}
                    </div>
                    <div className="text-sm text-slate-200">
                      {s.options
                        ? s.options.find((o) => o.value === val)?.label ?? val
                        : val}
                    </div>
                  </GlassCard>
                </AnimatedFadeIn>
              );
            })}
          </div>

          <div className="flex gap-3">
            <GlowButton variant="primary" size="md" onClick={() => { window.location.hash = "#/objectives"; }}>
              Ver objetivos
            </GlowButton>
            <GlowButton variant="secondary" size="md" onClick={() => { window.location.hash = "#/requests"; }}>
              Configuracion
            </GlowButton>
            <GlowButton variant="secondary" size="md" onClick={() => { window.location.hash = "#/"; }}>
              Inicio
            </GlowButton>
          </div>
        </AnimatedFadeIn>
      </PageContainer>
    );
  }

  // ── Result screen ──
  if (phase === "result" && result) {
    return (
      <PageContainer maxWidth="sm">
        <AnimatedFadeIn>
          <GlassCard
            glow={result.success ? "success" : "error"}
            className="text-center !p-8"
          >
            <div
              className={`text-4xl mb-4 ${result.success ? "text-green-400" : "text-red-400"}`}
            >
              {result.success ? "\u2713" : "\u2717"}
            </div>
            <h2 className="text-xl font-bold mb-3 text-white">
              {result.success ? "Configuracion completa" : "Hubo un error"}
            </h2>
            <p className="text-slate-300 mb-6">{result.message}</p>
            <div className="flex gap-3 justify-center">
              {result.missingRequests ? (
                <GlowButton variant="primary" size="md" onClick={() => { window.location.hash = "#/requests"; }}>
                  Ir a Configuracion
                </GlowButton>
              ) : (
                <GlowButton variant="primary" size="md" onClick={() => { window.location.hash = "#/"; }}>
                  Ir al Inicio
                </GlowButton>
              )}
            </div>
          </GlassCard>
        </AnimatedFadeIn>
      </PageContainer>
    );
  }

  // ── Summary screen ──
  if (phase === "summary") {
    return (
      <PageContainer maxWidth="sm">
        <AnimatedFadeIn>
          <h2 className="text-2xl font-bold mb-6 text-white">Resumen</h2>
          <div className="space-y-3 mb-8">
            <GlassCard className="!p-4">
              <div className="text-xs text-slate-500 uppercase mb-1">Perfil del proyecto</div>
              <div className="text-sm text-blue-400 font-medium">{humanizeProfileId(projectProfile)}</div>
            </GlassCard>
            {steps.map((s, i) => (
              <AnimatedFadeIn key={s.key} delay={i * 60}>
                <GlassCard className="!p-4">
                  <div className="text-xs text-slate-500 uppercase mb-1">
                    {s.title.replace("?", "")}
                  </div>
                  <div className="text-sm text-slate-200">
                    {s.options
                      ? s.options.find((o) => o.value === answers[s.key])?.label ??
                        answers[s.key] ?? "—"
                      : answers[s.key] || "—"}
                  </div>
                </GlassCard>
              </AnimatedFadeIn>
            ))}
          </div>
          <div className="flex gap-3">
            <GlowButton variant="secondary" size="md" onClick={handleBack}>
              Volver
            </GlowButton>
            <GlowButton
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Guardando..." : "Comenzar"}
            </GlowButton>
          </div>
        </AnimatedFadeIn>
      </PageContainer>
    );
  }

  // ── Questions screen ──
  return (
    <PageContainer maxWidth="sm">
      {/* Profile badge (read-only, from project) */}
      <AnimatedFadeIn>
        <GlassCard glow="primary" className="!p-3 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-blue-400 font-medium">Perfil:</span>
            <span className="text-white">{humanizeProfileId(projectProfile)}</span>
          </div>
        </GlassCard>
      </AnimatedFadeIn>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={
              i <= currentStep
                ? { background: "linear-gradient(90deg, #6366F1, #06B6D4)" }
                : { background: "rgba(51, 65, 85, 0.5)" }
            }
          />
        ))}
      </div>

      {/* Step counter */}
      <div className="text-xs text-slate-500 mb-2">
        Paso {currentStep + 1} de {totalSteps}
      </div>

      {/* Question */}
      <AnimatedFadeIn key={`step-${currentStep}`}>
        <h2 className="text-xl font-bold mb-2 text-white">{step.title}</h2>
        <p className="text-sm text-slate-400 mb-6">{step.subtitle}</p>

        {/* Input */}
        {step.type === "textarea" && (
          <textarea
            value={answers[step.key] ?? ""}
            onChange={(e) =>
              setAnswers({ ...answers, [step.key]: e.target.value })
            }
            placeholder={step.placeholder}
            rows={4}
            className="w-full bg-elevated border border-[rgba(148,163,184,0.08)] rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-none transition-colors"
          />
        )}

        {step.type === "radio" && step.options && (
          <div className="space-y-2">
            {step.options.map((opt) => (
              <GlassCard
                key={opt.value}
                hover
                glow={answers[step.key] === opt.value ? "primary" : "none"}
                onClick={() =>
                  setAnswers({ ...answers, [step.key]: opt.value })
                }
                className="!p-4"
              >
                <div className="text-sm font-medium text-white">{opt.label}</div>
                <div className="text-xs text-slate-400">{opt.desc}</div>
              </GlassCard>
            ))}
          </div>
        )}
      </AnimatedFadeIn>

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {currentStep > 0 && (
          <GlowButton variant="secondary" size="md" onClick={handleBack}>
            Anterior
          </GlowButton>
        )}
        <GlowButton
          variant="primary"
          size="lg"
          onClick={handleNext}
          disabled={!canNext}
          className="flex-1"
        >
          {currentStep === totalSteps - 1 ? "Revisar" : "Siguiente"}
        </GlowButton>
      </div>
    </PageContainer>
  );
}
