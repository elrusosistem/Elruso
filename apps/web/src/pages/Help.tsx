import { OnboardingContent } from "../components/OperatorOnboardingModal";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Que es un Plan?",
    a: "Es una propuesta automatica de mejoras o tareas. La IA analiza el estado del sistema y sugiere que hacer. Vos lo aprobas o rechazas.",
  },
  {
    q: "Que es una Tarea?",
    a: "Una accion concreta que el sistema ejecuta. Por ejemplo: actualizar un archivo, correr un proceso o configurar algo.",
  },
  {
    q: 'Que significa "En curso"?',
    a: "El sistema esta trabajando en eso ahora mismo. No necesitas hacer nada, solo esperar.",
  },
  {
    q: 'Que significa "Necesita configuracion"?',
    a: "Falta una clave o dato para poder continuar. Anda a Configuracion y completa lo que se pide.",
  },
  {
    q: "Que pasa si pauso el sistema?",
    a: "No se ejecutan nuevas tareas hasta que lo reanudes. Las tareas pendientes quedan en espera.",
  },
  {
    q: "Puede romper algo?",
    a: "No. El sistema no ejecuta nada sin tu aprobacion previa. Primero genera un plan, vos lo revisas, y solo despues se ejecuta.",
  },
  {
    q: "Donde veo lo que cambio?",
    a: 'En "Ejecuciones". Cada ejecucion tiene una seccion "Que cambio" donde ves los archivos afectados.',
  },
  {
    q: "Que es el Agente?",
    a: "Es el programa que ejecuta las tareas. Si dice \"Activo\" esta funcionando. Si dice \"Apagado\" necesita iniciarse.",
  },
];

export function Help() {
  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Ayuda</h2>

      {/* Reuse onboarding content */}
      <div className="mb-10">
        <OnboardingContent />
      </div>

      {/* FAQ */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Preguntas frecuentes</h3>
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-1">{item.q}</h4>
              <p className="text-sm text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
