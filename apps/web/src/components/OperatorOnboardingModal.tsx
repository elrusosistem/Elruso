import { useState, useEffect } from "react";

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

  return <OnboardingContent onDismiss={dismiss} />;
}

export function OnboardingContent({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className={onDismiss ? "fixed inset-0 z-50 flex items-center justify-center bg-black/70" : ""}>
      <div className={`bg-gray-900 border border-gray-700 rounded-xl ${onDismiss ? "max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" : "max-w-2xl"} p-6 space-y-5`}>
        <h2 className="text-xl font-bold">Como usar el sistema</h2>

        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Que hace este sistema</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>Genera planes de trabajo automaticamente</li>
            <li>Ejecuta tareas tecnicas sin que tengas que intervenir</li>
            <li>Te muestra que se hizo y que falta</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Que significa cada seccion</h3>
          <dl className="text-sm text-gray-300 space-y-1.5">
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Inicio</dt>
              <dd>Vista general del estado del sistema</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-white min-w-[110px]">Planes</dt>
              <dd>Propuestas de mejora generadas por la IA</dd>
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
              <dd>Datos que el sistema necesita (claves, tokens)</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Flujo recomendado</h3>
          <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
            <li>Hacer clic en <span className="font-medium text-white">"Generar plan"</span></li>
            <li>Revisar el plan creado en <span className="font-medium text-white">Planes</span></li>
            <li>Aprobarlo</li>
            <li>El sistema ejecuta solo</li>
            <li>Mirar <span className="font-medium text-white">Ejecuciones</span> para ver resultados</li>
          </ol>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-blue-400 mb-2">Si algo aparece en rojo</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>Puede necesitar configuracion (una clave o dato)</li>
            <li>Ir a <span className="font-medium text-white">"Configuracion"</span> y completar lo que falte</li>
            <li>El sistema reintenta automaticamente</li>
          </ul>
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full mt-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}
