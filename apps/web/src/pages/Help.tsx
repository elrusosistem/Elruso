import { OnboardingContent } from "../components/OperatorOnboardingModal";

const HOW_TO_START = [
  { step: "1", title: "Crea un proyecto", desc: "Anda a Proyectos y hace clic en \"Nuevo proyecto\". Elegí un nombre y un perfil (Abierto, Tiendanube o WhatsApp API)." },
  { step: "2", title: "Completa la estrategia", desc: "Despues de crear el proyecto, el sistema te guia con preguntas simples sobre tu negocio. Si el perfil necesita datos (tokens, claves), te los pide en Configuracion." },
  { step: "3", title: "Generá tu primer plan", desc: "Con al menos un objetivo activo y los datos configurados, podes generar un plan. El sistema propone mejoras y vos aprobas o rechazas." },
];

const CONCEPTS: { q: string; a: string }[] = [
  {
    q: "Que es un Proyecto?",
    a: "Un proyecto es tu espacio de trabajo aislado. Cada proyecto tiene su propio perfil, objetivos, configuracion y planes. Podes tener varios proyectos, por ejemplo uno para tu tienda y otro para WhatsApp.",
  },
  {
    q: "Que es un Perfil?",
    a: "El perfil define que tipo de integracion usa tu proyecto. Hay 3 opciones: \"Abierto\" (cualquier sistema, vos definis el objetivo), \"Tiendanube\" (conectar tienda y automatizar operaciones), y \"WhatsApp API\" (conectar tu WhatsApp Business API y preparar plantillas). El perfil se elige al crear el proyecto y no se puede cambiar despues.",
  },
  {
    q: "Que es un Plan?",
    a: "Es una propuesta automatica que la IA genera analizando tu proyecto. Incluye tareas concretas como actualizar archivos, configurar integraciones o correr procesos. Vos lo revisas y decides si aprobarlo.",
  },
  {
    q: "Por que pide tokens y datos?",
    a: "Para conectarse a servicios externos (Tiendanube, WhatsApp, etc.), el sistema necesita tokens de acceso. Son llaves seguras que le permiten operar en tu nombre. Los valores se guardan de forma segura en un vault local, nunca se suben al panel ni al repositorio.",
  },
  {
    q: "Que hace el boton \"Generar plan\"?",
    a: "Lanza un analisis con IA que revisa el estado de tu proyecto, tus objetivos y los datos disponibles. Si todo esta en orden, genera un plan con tareas. Si falta algo, te avisa que configurar primero.",
  },
  {
    q: "Y si no entiende mi objetivo?",
    a: "El sistema te hace preguntas de clarificacion si necesita mas contexto. Podes escribir en lenguaje natural, no necesitas ser tecnico. Si algo no queda claro, genera un plan conservador y te pide feedback.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Que es el Wizard?",
    a: "Es la configuracion inicial de cada proyecto. Te hace preguntas sobre tu negocio para entender que necesitas. Se completa una vez por proyecto. Podes verlo en Estrategia.",
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
    a: "Para conectarse a servicios externos, el sistema necesita tokens de acceso. Son llaves seguras que le permiten operar en tu nombre. Los tokens se guardan de forma segura y nunca se comparten.",
  },
  {
    q: 'Que significa "No se puede generar plan" y como lo destrabo?',
    a: "Hay 3 causas comunes: (1) No completaste la configuracion inicial — anda a Estrategia y completa el wizard. (2) No hay objetivos activos — anda a Objetivos y activa al menos uno. (3) Faltan datos de configuracion — anda a Configuracion y completa los datos marcados como requeridos.",
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

      {/* How to start */}
      <div className="mb-10">
        <h3 className="text-lg font-semibold mb-4">Como empezar</h3>
        <div className="space-y-3">
          {HOW_TO_START.map((item) => (
            <div key={item.step} className="flex gap-4 bg-gray-800 rounded-lg p-4">
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-indigo-600 text-sm font-bold">
                {item.step}
              </div>
              <div>
                <h4 className="text-sm font-medium text-white mb-1">{item.title}</h4>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Concepts */}
      <div className="mb-10">
        <h3 className="text-lg font-semibold mb-4">Conceptos clave</h3>
        <div className="space-y-4">
          {CONCEPTS.map((item, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-white mb-1">{item.q}</h4>
              <p className="text-sm text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>
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
