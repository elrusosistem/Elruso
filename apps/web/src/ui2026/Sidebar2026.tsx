import { useState } from "react";
import { OPERATOR_NAV_LABELS } from "../humanize";

interface NavItem {
  path: string;
  label: string;
  match: string;
  icon: string;
  opHidden?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: "#/", label: "Dashboard", match: "#/", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { path: "#/runs", label: "Runs", match: "#/runs", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { path: "#/tasks", label: "Tasks", match: "#/tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { path: "#/objectives", label: "Objetivos", match: "#/objectives", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { path: "#/directives", label: "Directivas", match: "#/directives", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { path: "#/decisions", label: "Decisions", match: "#/decisions", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { path: "#/requests", label: "Requests", match: "#/requests", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { path: "#/projects", label: "Proyectos", match: "#/projects", icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" },
  { path: "#/strategy-wizard", label: "Estrategia", match: "#/strategy-wizard", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
  { path: "#/setup", label: "Setup", match: "#/setup", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", opHidden: true },
  { path: "#/help", label: "Ayuda", match: "#/help", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

interface Sidebar2026Props {
  currentHash: string;
  isOp: boolean;
}

function isActive(item: NavItem, hash: string): boolean {
  if (item.match === "#/") {
    return hash === "" || hash === "#" || hash === "#/";
  }
  return hash.startsWith(item.match);
}

export function Sidebar2026({ currentHash, isOp }: Sidebar2026Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleItems = isOp
    ? NAV_ITEMS.filter((item) => !item.opHidden)
    : NAV_ITEMS;

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-40 glass transition-all duration-200 flex flex-col ${
        expanded ? "w-56" : "w-16"
      }`}
      style={{ background: "rgba(11, 15, 26, 0.85)" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <a
        href="#/"
        className="h-14 flex items-center px-4 border-b border-[rgba(148,163,184,0.06)]"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
        >
          R
        </div>
        {expanded && (
          <span className="ml-3 text-sm font-bold tracking-tight text-white animate-fade-in">
            Elruso
          </span>
        )}
      </a>

      {/* Nav items */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = isActive(item, currentHash);
          const label = isOp
            ? (OPERATOR_NAV_LABELS[item.label] ?? item.label)
            : item.label;

          return (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-150 group ${
                active
                  ? "bg-accent-primary/15 text-white"
                  : "text-slate-500 hover:text-slate-200 hover:bg-elevated/50"
              }`}
            >
              <svg
                className={`w-5 h-5 flex-shrink-0 ${active ? "text-accent-primary" : "text-slate-500 group-hover:text-slate-300"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {expanded && (
                <span className="text-sm font-medium truncate animate-fade-in">
                  {label}
                </span>
              )}
              {active && !expanded && (
                <div className="absolute left-0 w-0.5 h-5 bg-accent-primary rounded-r" />
              )}
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[rgba(148,163,184,0.06)] p-3">
        {expanded && (
          <div className="text-xs text-slate-600 animate-fade-in">
            Build: {typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "dev"}
          </div>
        )}
      </div>
    </aside>
  );
}
