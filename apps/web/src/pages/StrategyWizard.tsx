import { useState, useEffect, useMemo } from "react";
import type { ApiResponse, Objective, WizardState } from "@elruso/types";
import { apiFetch } from "../api";
import { humanizeProfileId } from "../humanize";

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
    return <div className="p-8 text-gray-400">Cargando...</div>;
  }

  // ── Already completed: show summary ──
  if (phase === "already_done") {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-2">Estrategia configurada</h2>
        <p className="text-sm text-gray-400 mb-6">
          Ya completaste la configuracion inicial para este proyecto.
        </p>

        <div className="space-y-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Perfil</div>
            <div className="text-sm text-blue-400 font-medium">{humanizeProfileId(projectProfile)}</div>
          </div>
          {steps.map((s) => {
            const val = answers[s.key];
            if (!val) return null;
            return (
              <div key={s.key} className="bg-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase mb-1">
                  {s.title.replace("?", "")}
                </div>
                <div className="text-sm text-gray-200">
                  {s.options
                    ? s.options.find((o) => o.value === val)?.label ?? val
                    : val}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <a
            href="#/objectives"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            Ver objetivos
          </a>
          <a
            href="#/requests"
            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Configuracion
          </a>
          <a
            href="#/"
            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Inicio
          </a>
        </div>
      </div>
    );
  }

  // ── Result screen ──
  if (phase === "result" && result) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div
          className={`rounded-lg p-8 text-center ${
            result.success
              ? "bg-green-900/30 border border-green-700"
              : "bg-red-900/30 border border-red-700"
          }`}
        >
          <div
            className={`text-4xl mb-4 ${result.success ? "text-green-400" : "text-red-400"}`}
          >
            {result.success ? "\u2713" : "\u2717"}
          </div>
          <h2 className="text-xl font-bold mb-3">
            {result.success ? "Configuracion completa" : "Hubo un error"}
          </h2>
          <p className="text-gray-300 mb-6">{result.message}</p>
          <div className="flex gap-3 justify-center">
            {result.missingRequests ? (
              <a
                href="#/requests"
                className="px-6 py-2.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-medium transition-colors"
              >
                Ir a Configuracion
              </a>
            ) : (
              <a
                href="#/"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
              >
                Ir al Inicio
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Summary screen ──
  if (phase === "summary") {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Resumen</h2>
        <div className="space-y-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Perfil del proyecto</div>
            <div className="text-sm text-blue-400 font-medium">{humanizeProfileId(projectProfile)}</div>
          </div>
          {steps.map((s) => (
            <div key={s.key} className="bg-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase mb-1">
                {s.title.replace("?", "")}
              </div>
              <div className="text-sm text-gray-200">
                {s.options
                  ? s.options.find((o) => o.value === answers[s.key])?.label ??
                    answers[s.key] ?? "—"
                  : answers[s.key] || "—"}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors flex-1"
          >
            {saving ? "Guardando..." : "Comenzar"}
          </button>
        </div>
      </div>
    );
  }

  // ── Questions screen ──
  return (
    <div className="p-8 max-w-xl mx-auto">
      {/* Profile badge (read-only, from project) */}
      <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-700 rounded text-sm">
        <span className="text-blue-400 font-medium">Perfil:</span>
        <span className="text-white">{humanizeProfileId(projectProfile)}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentStep ? "bg-indigo-500" : "bg-gray-700"
            }`}
          />
        ))}
      </div>

      {/* Step counter */}
      <div className="text-xs text-gray-500 mb-2">
        Paso {currentStep + 1} de {totalSteps}
      </div>

      {/* Question */}
      <h2 className="text-xl font-bold mb-2">{step.title}</h2>
      <p className="text-sm text-gray-400 mb-6">{step.subtitle}</p>

      {/* Input */}
      {step.type === "textarea" && (
        <textarea
          value={answers[step.key] ?? ""}
          onChange={(e) =>
            setAnswers({ ...answers, [step.key]: e.target.value })
          }
          placeholder={step.placeholder}
          rows={4}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
        />
      )}

      {step.type === "radio" && step.options && (
        <div className="space-y-2">
          {step.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setAnswers({ ...answers, [step.key]: opt.value })
              }
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                answers[step.key] === opt.value
                  ? "bg-indigo-900/30 border-indigo-500"
                  : "bg-gray-800 border-gray-700 hover:border-gray-500"
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs text-gray-400">{opt.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {currentStep > 0 && (
          <button
            onClick={handleBack}
            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Anterior
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canNext}
          className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex-1"
        >
          {currentStep === totalSteps - 1 ? "Revisar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
