import { useState, useEffect } from "react";
import { Modal2026, GlowButton, GlassCard } from "../ui2026";

const STORAGE_KEY = "operator_onboarded";

export function OperatorOnboardingModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "true") {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <Modal2026 open={show} onClose={dismiss} title="Como usar el sistema" maxWidth="max-w-lg">
      <OnboardingContent onDismiss={dismiss} />
    </Modal2026>
  );
}

export function OnboardingContent({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className={!onDismiss ? "max-w-2xl" : ""}>
      <div className="space-y-5">
        <GlassCard>
          <h3 className="text-sm font-semibold text-accent-primary mb-2">Que hace este sistema</h3>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>Creas un proyecto con un perfil (Abierto, Tiendanube o WhatsApp)</li>
            <li>Definis objetivos de negocio en lenguaje natural</li>
            <li>La IA genera planes de trabajo y los ejecuta automaticamente</li>
            <li>Vos solo revisas, aprobas y ves los resultados</li>
          </ul>
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-accent-primary mb-2">Secciones del panel</h3>
          <dl className="text-sm text-slate-300 space-y-1.5">
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Inicio</dt>
              <dd>Estado general, metricas y accesos rapidos</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Proyectos</dt>
              <dd>Crear, seleccionar y borrar proyectos</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Objetivos</dt>
              <dd>Metas de negocio que guian la IA</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Planes</dt>
              <dd>Propuestas generadas por la IA para revisar</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Tareas</dt>
              <dd>Acciones concretas que el sistema ejecuta</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Ejecuciones</dt>
              <dd>Historial de lo que se hizo y los resultados</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Configuracion</dt>
              <dd>Tokens y claves que el sistema necesita</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Estrategia</dt>
              <dd>Wizard inicial para definir tu negocio</dd>
            </div>
          </dl>
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-accent-primary mb-2">Flujo recomendado</h3>
          <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
            <li>Crear un proyecto en <span className="font-medium text-white">Proyectos</span></li>
            <li>Completar el wizard en <span className="font-medium text-white">Estrategia</span></li>
            <li>Configurar datos requeridos en <span className="font-medium text-white">Configuracion</span></li>
            <li>Hacer clic en <span className="font-medium text-white">"Generar plan"</span></li>
            <li>Revisar y aprobar el plan</li>
            <li>El sistema ejecuta solo — ver resultados en <span className="font-medium text-white">Ejecuciones</span></li>
          </ol>
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-accent-primary mb-2">Si algo aparece en rojo</h3>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>Puede necesitar configuracion (una clave o dato)</li>
            <li>Ir a <span className="font-medium text-white">Configuracion</span> y completar lo que falte</li>
            <li>El sistema reintenta automaticamente</li>
          </ul>
        </GlassCard>

        {onDismiss && (
          <GlowButton onClick={onDismiss} variant="primary" size="lg" className="w-full">
            Entendido
          </GlowButton>
        )}
      </div>
    </div>
  );
}
