import { OnboardingContent } from "../components/OperatorOnboardingModal";
import {
  PageContainer, GlassCard, GlowButton, SectionBlock, HeroPanel, AnimatedFadeIn,
} from "../ui2026";
import { useTour, TOUR_TOTAL_MINUTES } from "../tour";

/* ── Como se usa (guia principal) ── */

const GUIDE_STEPS = [
  {
    step: "1",
    title: "Crea un proyecto",
    desc: "Anda a Proyectos en la barra lateral y hace clic en \"Nuevo proyecto\". Elegí un nombre y un perfil: Abierto (cualquier sistema), Tiendanube (e-commerce) o WhatsApp API (mensajeria). El perfil no se puede cambiar despues.",
  },
  {
    step: "2",
    title: "Completa la estrategia",
    desc: "El wizard te hace preguntas simples sobre tu negocio: que vendes, que queres lograr, que herramientas usas. Con eso la IA entiende tu contexto. Lo encontras en Estrategia en la barra lateral.",
  },
  {
    step: "3",
    title: "Configura lo requerido",
    desc: "Si tu perfil necesita tokens o claves (Tiendanube, WhatsApp), anda a Configuracion y completa los datos marcados como requeridos. El sistema valida cada dato en tiempo real.",
  },
  {
    step: "4",
    title: "Genera tu primer plan",
    desc: "Desde Inicio, hace clic en \"Generar plan\". La IA analiza tus objetivos, tu estrategia y tus datos, y genera un plan con tareas concretas. Vos lo revisas en Planes.",
  },
  {
    step: "5",
    title: "Aproba y deja que ejecute",
    desc: "Si el plan te convence, aprobalo. El sistema ejecuta las tareas automaticamente. Podes ver el progreso en Tareas y los resultados en Ejecuciones.",
  },
];

/* ── Secciones del panel ── */

const SECTIONS = [
  { name: "Inicio", desc: "Dashboard con metricas, estado del sistema, accesos rapidos a generar plan, pausar y actualizar. Muestra objetivos activos, tareas pendientes y estado del agente." },
  { name: "Proyectos", desc: "Lista de todos tus proyectos. Podes crear nuevos, seleccionar uno para trabajar o borrar los que ya no uses. Cada proyecto es independiente." },
  { name: "Objetivos", desc: "Metas de negocio en lenguaje natural. La IA genera planes alineados a estos objetivos. Podes activar, pausar o completar objetivos." },
  { name: "Planes", desc: "Propuestas de trabajo generadas por la IA. Cada plan tiene tareas concretas. Los revisas, aprobas o rechazas. Solo los aprobados se ejecutan." },
  { name: "Tareas", desc: "Acciones individuales que el sistema ejecuta: actualizar archivos, correr procesos, configurar integraciones. Cada tarea tiene un estado visible." },
  { name: "Ejecuciones", desc: "Historial completo de lo que se hizo. Cada ejecucion muestra que cambio, el output del proceso y si fue exitoso o fallo." },
  { name: "Decisiones", desc: "Registro de todas las decisiones tomadas por la IA: que aprobo, que rechazo, que planeo. Funciona como log de auditoria." },
  { name: "Configuracion", desc: "Tokens, claves y datos que el sistema necesita para operar. Se validan automaticamente. Los valores se guardan de forma segura y nunca se exponen." },
  { name: "Estrategia", desc: "Wizard paso a paso para definir tu negocio. Tipo de empresa, productos, canales de venta, herramientas. Se completa una vez por proyecto." },
  { name: "Runners", desc: "Estado de los agentes ejecutores. Muestra si estan activos, su ultimo heartbeat y cuantas tareas procesaron." },
];

/* ── Conceptos clave ── */

const CONCEPTS: { q: string; a: string }[] = [
  {
    q: "Que es un Proyecto?",
    a: "Un proyecto es tu espacio de trabajo aislado. Tiene su propio perfil, objetivos, configuracion y planes. Podes tener varios proyectos, por ejemplo uno para tu tienda y otro para WhatsApp. Todo esta separado.",
  },
  {
    q: "Que es un Perfil?",
    a: "El perfil define que tipo de integracion usa tu proyecto. Hay 3 opciones: \"Abierto\" (cualquier sistema, sin datos obligatorios), \"Tiendanube\" (e-commerce, requiere token y store ID) y \"WhatsApp API\" (mensajeria, requiere 7 credenciales de Meta). Se elige al crear el proyecto y no se cambia.",
  },
  {
    q: "Que es un Plan?",
    a: "Es una propuesta automatica que la IA genera analizando tu proyecto, tus objetivos y tu contexto. Incluye tareas concretas. Vos lo revisas y decides si aprobarlo. Solo los planes aprobados se ejecutan.",
  },
  {
    q: "Que es una Directiva?",
    a: "Es una instruccion que GPT le da al sistema. Define que hacer, como y en que orden. Las directivas se convierten en tareas ejecutables. Podes verlas y aprobar/rechazar desde Planes.",
  },
  {
    q: "Que es un Objetivo?",
    a: "Es una meta de negocio escrita en lenguaje natural. Por ejemplo: \"Aumentar las ventas un 20%\" o \"Automatizar respuestas de WhatsApp\". La IA genera planes alineados a tus objetivos activos.",
  },
  {
    q: "Que es un Runner?",
    a: "Es el agente ejecutor que procesa las tareas. Corre en segundo plano, reporta heartbeat cada pocos segundos y ejecuta las acciones de los planes aprobados.",
  },
];

/* ── Preguntas frecuentes ── */

const FAQ: { q: string; a: string }[] = [
  {
    q: "Por que no puedo generar un plan?",
    a: "Necesitas: (1) completar la estrategia (wizard), (2) tener al menos un objetivo activo, y (3) configurar los datos requeridos por tu perfil en Configuracion. El dashboard te muestra un checklist de lo que falta.",
  },
  {
    q: "Que pasa si pauso el sistema?",
    a: "No se ejecutan nuevas tareas hasta que lo reanudes. Las tareas pendientes quedan en espera. Podes pausar y reanudar desde el dashboard.",
  },
  {
    q: "Puede romper algo?",
    a: "No. El sistema no ejecuta nada sin tu aprobacion previa. Primero genera un plan, vos lo revisas, y solo despues se ejecuta.",
  },
  {
    q: "Donde veo lo que cambio?",
    a: "En Ejecuciones. Cada ejecucion tiene detalle de los archivos afectados, el output del proceso y el resultado.",
  },
  {
    q: "Si algo aparece en rojo, que hago?",
    a: "Generalmente falta una clave o dato. Anda a Configuracion y completa lo que se marca como requerido. El sistema reintenta automaticamente cuando el dato esta disponible.",
  },
  {
    q: "Como cambio entre proyectos?",
    a: "Hace clic en el nombre del proyecto en la barra superior o anda a Proyectos en la barra lateral. Al seleccionar otro proyecto, todo el panel cambia al contexto de ese proyecto.",
  },
  {
    q: "Puedo tener varios proyectos?",
    a: "Si. Cada proyecto es independiente: tiene su propio perfil, objetivos, datos y planes. Podes crear tantos como necesites.",
  },
  {
    q: "Que es el modo tecnico?",
    a: "El panel tiene dos modos: Operador (vista simple, enfocada en acciones) y Tecnico (vista completa con metricas detalladas, IDs, runners). Podes cambiar con el toggle en la barra superior.",
  },
  {
    q: "Los tokens son seguros?",
    a: "Si. Los tokens se guardan en un vault del servidor y nunca se envian al frontend. Solo se validan al ingresarlos y se usan internamente para operar.",
  },
  {
    q: "Que pasa si el agente esta apagado?",
    a: "Las tareas se acumulan en espera. Cuando el agente se inicia, procesa todo lo pendiente. Podes ver el estado del agente en el dashboard.",
  },
];

/* ── WABA FAQ ── */

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
    a: "El sistema necesita verificar que tenes acceso real a la API de WhatsApp antes de generar un plan. Sin las 7 credenciales obligatorias no puede validar tu cuenta ni planificar integraciones.",
  },
];

/* ── Componentes ── */

function StepItem({ step, title, desc, delay = 0 }: { step: string; title: string; desc: string; delay?: number }) {
  return (
    <AnimatedFadeIn delay={delay}>
      <GlassCard>
        <div className="flex gap-4">
          <div
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold text-white"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.7))",
            }}
          >
            {step}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-1">{title}</h4>
            <p className="text-sm text-slate-400">{desc}</p>
          </div>
        </div>
      </GlassCard>
    </AnimatedFadeIn>
  );
}

function FaqItem({ q, a, delay = 0 }: { q: string; a: string; delay?: number }) {
  return (
    <AnimatedFadeIn delay={delay}>
      <GlassCard>
        <h4 className="text-sm font-medium text-white mb-1">{q}</h4>
        <p className="text-sm text-slate-400">{a}</p>
      </GlassCard>
    </AnimatedFadeIn>
  );
}

/* ── Pagina ── */

export function Help() {
  const [tour, tourActions] = useTour();

  return (
    <PageContainer maxWidth="md">
      <HeroPanel title="Como se usa?" subtitle="Guia completa del sistema, secciones, conceptos y preguntas frecuentes" />

      {/* Recorrido guiado */}
      <div className="mb-8">
        <AnimatedFadeIn>
          <GlassCard glow={tour.completed ? "success" : "primary"}>
            <h3 className="text-lg font-semibold text-white mb-1">
              {tour.completed ? "Recorrido completado" : "Recorrido guiado"}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {tour.completed
                ? "Ya completaste la guia interactiva. Podes reiniciarla en cualquier momento."
                : `Recorre las secciones del panel paso a paso con una guia interactiva (${TOUR_TOTAL_MINUTES}).`}
            </p>
            <GlowButton
              variant={tour.completed ? "secondary" : "primary"}
              size="md"
              onClick={() => { tourActions.reset(); tourActions.start(); }}
            >
              {tour.completed ? "Reiniciar guia" : "Iniciar recorrido"}
            </GlowButton>
          </GlassCard>
        </AnimatedFadeIn>
      </div>

      {/* Resumen rapido (onboarding) */}
      <div className="mb-10">
        <OnboardingContent />
      </div>

      {/* Guia paso a paso */}
      <SectionBlock title="Paso a paso">
        <div className="space-y-3">
          {GUIDE_STEPS.map((item, i) => (
            <StepItem key={item.step} step={item.step} title={item.title} desc={item.desc} delay={i * 60} />
          ))}
        </div>
      </SectionBlock>

      {/* Secciones del panel */}
      <SectionBlock title="Que hay en cada seccion">
        <div className="space-y-3">
          {SECTIONS.map((item, i) => (
            <AnimatedFadeIn key={item.name} delay={i * 40}>
              <GlassCard>
                <div className="flex gap-3">
                  <span className="text-sm font-semibold text-accent-primary min-w-[110px]">{item.name}</span>
                  <p className="text-sm text-slate-400">{item.desc}</p>
                </div>
              </GlassCard>
            </AnimatedFadeIn>
          ))}
        </div>
      </SectionBlock>

      {/* Conceptos clave */}
      <SectionBlock title="Conceptos clave">
        <div className="space-y-4">
          {CONCEPTS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} delay={i * 40} />
          ))}
        </div>
      </SectionBlock>

      {/* FAQ */}
      <SectionBlock title="Preguntas frecuentes">
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} delay={i * 30} />
          ))}
        </div>
      </SectionBlock>

      {/* WABA FAQ */}
      <SectionBlock title="WhatsApp API">
        <div className="space-y-4">
          {WABA_FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} delay={i * 40} />
          ))}
        </div>
      </SectionBlock>
    </PageContainer>
  );
}
