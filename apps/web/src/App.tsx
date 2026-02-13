import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "./api";
import { useUiMode } from "./uiMode";
import { OPERATOR_NAV_LABELS } from "./humanize";
import { RunsList } from "./pages/RunsList";
import { RunDetail } from "./pages/RunDetail";
import { RequestsList } from "./pages/RequestsList";
import { DirectivesList } from "./pages/DirectivesList";
import { TasksList } from "./pages/TasksList";
import { SetupWizard } from "./pages/SetupWizard";
import { RunnersList } from "./pages/RunnersList";
import { DecisionsList } from "./pages/DecisionsList";
import { Dashboard } from "./pages/Dashboard";
import { Help } from "./pages/Help";
import { OperatorOnboardingModal } from "./components/OperatorOnboardingModal";

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

function StatusBadge() {
  const [status, setStatus] = useState<string>("...");
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    apiFetch("/api/health")
      .then((r) => r.json())
      .then((data: ApiResponse<{ status: string }>) => {
        setStatus(data.data?.status ?? "unknown");
      })
      .catch(() => setStatus("offline"));
  }, []);

  // Hide raw API badge in operator mode — runner badge is enough
  if (isOp) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${
          status === "healthy" ? "bg-green-500" : "bg-red-500"
        }`}
      />
      API: {status}
    </div>
  );
}

function RunnerBadge() {
  const [online, setOnline] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    const fetch = () => {
      apiFetch("/api/ops/runner/status")
        .then((r) => r.json())
        .then((data: ApiResponse<{ runner_id: string; status: string }[]>) => {
          if (data.ok && data.data) {
            setTotal(data.data.length);
            setOnline(data.data.filter((r) => r.status === "online").length);
          }
        })
        .catch(() => {});
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  if (total === 0) return null;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
      isOp && online === 0 ? "bg-red-900 text-red-200" : "bg-gray-800"
    }`}>
      <span className={`w-2 h-2 rounded-full ${online > 0 ? "bg-green-500" : "bg-red-500"}`} />
      {isOp
        ? (online > 0 ? "Agente activo" : "Agente apagado")
        : `Runner: ${online > 0 ? `${online} ONLINE` : "OFFLINE"}`}
    </div>
  );
}

function PauseControl() {
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const fetchStatus = () => {
    apiFetch("/api/ops/system/status")
      .then((r) => r.json())
      .then((data: ApiResponse<{ paused: boolean }>) => {
        if (data.ok && data.data) setPaused(data.data.paused);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggle = async () => {
    setLoading(true);
    const endpoint = paused ? "/api/ops/system/resume" : "/api/ops/system/pause";
    await apiFetch(endpoint, { method: "POST" });
    fetchStatus();
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs transition-colors ${
        paused
          ? "bg-red-700 hover:bg-red-600"
          : "bg-gray-800 hover:bg-gray-700"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${paused ? "bg-red-400" : "bg-green-500"}`} />
      {loading ? "..." : isOp
        ? (paused ? "Pausado" : "Activo")
        : (paused ? "Sistema PAUSADO" : "Sistema ACTIVO")}
    </button>
  );
}

const NAV_ITEMS = [
  { path: "#/", label: "Dashboard", match: "#/" },
  { path: "#/runs", label: "Runs", match: "#/runs" },
  { path: "#/tasks", label: "Tasks", match: "#/tasks" },
  { path: "#/directives", label: "Directivas", match: "#/directives" },
  { path: "#/decisions", label: "Decisions", match: "#/decisions" },
  { path: "#/requests", label: "Requests", match: "#/requests" },
  { path: "#/setup", label: "Setup", match: "#/setup" },
];

function ModeToggle() {
  const [mode, setMode] = useUiMode();
  return (
    <div className="inline-flex items-center rounded-full bg-gray-800 text-xs overflow-hidden">
      <button
        onClick={() => setMode("operator")}
        className={`px-3 py-1 transition-colors ${
          mode === "operator" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        Operador
      </button>
      <button
        onClick={() => setMode("technical")}
        className={`px-3 py-1 transition-colors ${
          mode === "technical" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
      >
        Tecnico
      </button>
    </div>
  );
}

export function App() {
  const hash = useHash();
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  const runDetailMatch = hash.match(/^#\/runs\/(.+)$/);

  let page: React.ReactNode;
  if (runDetailMatch) {
    page = <RunDetail runId={runDetailMatch[1]} />;
  } else if (hash === "#/requests") {
    page = <RequestsList />;
  } else if (hash === "#/directives") {
    page = <DirectivesList />;
  } else if (hash === "#/decisions") {
    page = <DecisionsList />;
  } else if (hash === "#/tasks") {
    page = <TasksList />;
  } else if (hash === "#/runners") {
    page = <RunnersList />;
  } else if (hash === "#/help") {
    page = <Help />;
  } else if (hash === "#/setup") {
    page = <SetupWizard />;
  } else if (hash === "#/runs") {
    page = <RunsList />;
  } else {
    page = <Dashboard />;
  }

  const visibleNav = isOp
    ? NAV_ITEMS.filter((item) => item.label !== "Setup")
    : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {isOp && <OperatorOnboardingModal />}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="#/" className="text-lg font-bold tracking-tight hover:text-gray-300">
            Elruso
          </a>
          {visibleNav.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`text-sm hover:text-white transition-colors ${
                (item.match === "#/" && (hash === "" || hash === "#" || hash === "#/"))
                  ? "text-white"
                  : (item.match !== "#/" && hash.startsWith(item.match))
                    ? "text-white"
                    : "text-gray-500"
              }`}
            >
              {isOp ? (OPERATOR_NAV_LABELS[item.label] ?? item.label) : item.label}
            </a>
          ))}
          {isOp && (
            <a
              href="#/help"
              className={`text-sm hover:text-white transition-colors ${
                hash === "#/help" ? "text-white" : "text-gray-500"
              }`}
            >
              Ayuda
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle />
          <RunnerBadge />
          <PauseControl />
          <StatusBadge />
        </div>
      </nav>
      <main className="flex-1">{page}</main>
      <footer className="border-t border-gray-800 px-6 py-2 text-xs text-gray-600 flex justify-between">
        <span>Elruso Panel</span>
        <span>Build: {__BUILD_COMMIT__} | {new Date(__BUILD_TIME__).toLocaleString("es-AR")}</span>
      </footer>
    </div>
  );
}
