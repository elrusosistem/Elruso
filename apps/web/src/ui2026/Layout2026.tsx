import type { ReactNode } from "react";
import { Sidebar2026 } from "./Sidebar2026";
import { Topbar2026 } from "./Topbar2026";
import { useUiMode } from "../uiMode";
import { OPERATOR_NAV_LABELS } from "../humanize";

interface Layout2026Props {
  children: ReactNode;
  currentHash: string;
}

const PAGE_TITLES: Record<string, string> = {
  "#/": "Inicio",
  "#/runs": "Ejecuciones",
  "#/tasks": "Tareas",
  "#/objectives": "Objetivos",
  "#/directives": "Planes",
  "#/decisions": "Decisiones",
  "#/requests": "Configuracion",
  "#/projects": "Proyectos",
  "#/strategy-wizard": "Estrategia",
  "#/setup": "Setup",
  "#/help": "Ayuda",
  "#/runners": "Runners",
};

function resolvePageTitle(hash: string, isOp: boolean): string {
  // Check run detail
  if (hash.match(/^#\/runs\/.+$/)) return isOp ? "Detalle de ejecucion" : "Run Detail";

  for (const [key, val] of Object.entries(PAGE_TITLES)) {
    if (key === "#/" && (hash === "" || hash === "#" || hash === "#/")) {
      return isOp ? (OPERATOR_NAV_LABELS["Dashboard"] ?? "Inicio") : "Dashboard";
    }
    if (key !== "#/" && hash.startsWith(key)) {
      return isOp ? val : key.replace("#/", "").charAt(0).toUpperCase() + key.replace("#/", "").slice(1);
    }
  }
  return isOp ? "Inicio" : "Dashboard";
}

export function Layout2026({ children, currentHash }: Layout2026Props) {
  const [mode] = useUiMode();
  const isOp = mode === "operator";
  const pageTitle = resolvePageTitle(currentHash, isOp);

  return (
    <div className="min-h-screen bg-deep text-white relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="bg-orb-1" />
      <div className="bg-orb-2" />

      {/* Sidebar */}
      <Sidebar2026 currentHash={currentHash} isOp={isOp} />

      {/* Main area */}
      <div className="ml-16 relative z-10 flex flex-col min-h-screen">
        <Topbar2026 pageTitle={pageTitle} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
