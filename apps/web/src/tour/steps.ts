export interface TourStep {
  id: string;
  title: string;
  body: string;
  route: string;
  selector: string;
  minutes: number;
  markable: boolean;
}

export const TOUR_TOTAL_MINUTES = "12-15 min";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "projects",
    title: "Proyectos",
    body: "Aca creas y seleccionas proyectos. Cada proyecto es independiente y tiene su propia configuracion, objetivos y planes.",
    route: "#/projects",
    selector: "projects-list",
    minutes: 1,
    markable: true,
  },
  {
    id: "strategy",
    title: "Estrategia",
    body: "Completa el wizard para que la IA conozca tu negocio. Responde preguntas simples sobre que vendes, que canales usas y que herramientas tenes.",
    route: "#/strategy-wizard",
    selector: "strategy-wizard",
    minutes: 2,
    markable: true,
  },
  {
    id: "objectives",
    title: "Objetivos",
    body: "Define metas de negocio en lenguaje natural. La IA genera planes alineados a tus objetivos activos.",
    route: "#/objectives",
    selector: "objectives-list",
    minutes: 1,
    markable: true,
  },
  {
    id: "config",
    title: "Configuracion",
    body: "Si tu perfil necesita tokens o claves (Tiendanube, WhatsApp), completa los datos requeridos. El sistema valida cada dato en tiempo real.",
    route: "#/requests",
    selector: "requests-list",
    minutes: 2,
    markable: true,
  },
  {
    id: "generate-plan",
    title: "Generar plan",
    body: "Con la estrategia y los objetivos listos, hace clic aca para que la IA analice todo y genere un plan con tareas concretas.",
    route: "#/",
    selector: "generate-plan-btn",
    minutes: 1,
    markable: false,
  },
  {
    id: "approve",
    title: "Aprobar plan",
    body: "Revisa las propuestas generadas por la IA. Si te convencen, aprobalas. Solo los planes aprobados se ejecutan.",
    route: "#/directives",
    selector: "directives-list",
    minutes: 1,
    markable: true,
  },
  {
    id: "tasks",
    title: "Tareas",
    body: "Las tareas son las acciones concretas que el sistema ejecuta: actualizar archivos, correr procesos, configurar integraciones.",
    route: "#/tasks",
    selector: "tasks-list",
    minutes: 1,
    markable: false,
  },
  {
    id: "runs",
    title: "Ejecuciones",
    body: "Historial de lo que se hizo. Cada ejecucion muestra que cambio, el output del proceso y si fue exitoso o fallo.",
    route: "#/runs",
    selector: "runs-list",
    minutes: 1,
    markable: false,
  },
  {
    id: "decisions",
    title: "Registro",
    body: "Log de todas las decisiones: que aprobo la IA, que rechazo, que planeo. Funciona como registro de auditoria.",
    route: "#/decisions",
    selector: "decisions-list",
    minutes: 1,
    markable: false,
  },
  {
    id: "view-project",
    title: "Ver proyecto",
    body: "Desde aca podes copiar el link de tu proyecto para compartirlo o abrirlo en otra pestana.",
    route: "#/projects",
    selector: "view-project-btn",
    minutes: 1,
    markable: true,
  },
];
