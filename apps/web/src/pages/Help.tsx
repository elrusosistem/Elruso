import { OnboardingContent } from "../components/OperatorOnboardingModal";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Que es el Wizard?",
    a: "Es una guia inicial que te ayuda a configurar el sistema para tu negocio. Solo se completa una vez. Podes encontrarlo en Definir estrategia.",
  },
  {
    q: "Que son los Objetivos?",
    a: "Son las metas de tu negocio. El sistema genera planes alineados a estos objetivos. Podes activar, pausar o completar objetivos desde la seccion Objetivos.",
  },
  {
    q: "Por que no puedo generar un plan?",
    a: "Necesitas: (1) completar la configuracion inicial (wizard), (2) tener al menos un objetivo activo, y (3) configurar los datos requeridos en Configuracion.",
  },
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
  {
    q: "Por que me pide tokens?",
    a: "Para conectarse a servicios externos (como Tiendanube o Mercado Libre), el sistema necesita tokens de acceso. Son como llaves seguras que le permiten operar en tu nombre. Los tokens se guardan de forma segura y nunca se comparten. Podes encontrarlos en el panel de administracion de cada servicio.",
  },
  {
    q: 'Que significa "No se puede generar plan" y como lo destrabo?',
    a: "Hay 3 causas comunes: (1) No completaste la configuracion inicial — anda a Definir estrategia y completa el wizard. (2) No hay objetivos activos — anda a Objetivos y activa al menos uno. (3) Faltan datos de configuracion — anda a Configuracion y completa los datos marcados como requeridos.",
  },
];

const WABA_FAQ: { q: string; a: string }[] = [
  {
    q: "Que es WABA?",
    a: "WhatsApp Business API permite automatizar mensajes, enviar notificaciones y gestionar conversaciones a escala. Es la version profesional de WhatsApp para empresas.",
  },
  {
    q: "Que datos pide el sistema para WhatsApp?",
    a: "Token de acceso (WABA_ACCESS_TOKEN), Phone Number ID, Business Account ID, App ID y Secret de Meta, Webhook Verify Token y Webhook URL. Todos se obtienen desde Meta Developers.",
  },
  {
    q: "Como se valida el token de WhatsApp?",
    a: "El sistema consulta la Graph API de Meta con tu token y Phone Number ID. Si la respuesta es exitosa, el token es valido.",
  },
  {
    q: "Que es el Webhook Verify Token?",
    a: "Es un codigo que vos elegis para verificar que los webhooks entrantes son realmente de Meta. Se configura en Meta Developers y debe coincidir con el que guardas aca.",
  },
  {
    q: "Por que no genera plan si faltan credenciales WABA?",
    a: "El sistema necesita verificar que tenes acceso real a la API de WhatsApp antes de generar un plan. Sin las credenciales no puede validar tu cuenta ni planificar integraciones.",
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

      {/* WABA FAQ */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold mb-4">WhatsApp API</h3>
        <div className="space-y-4">
          {WABA_FAQ.map((item, i) => (
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
