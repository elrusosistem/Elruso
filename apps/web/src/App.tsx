import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "./api";
import { RunsList } from "./pages/RunsList";
import { RunDetail } from "./pages/RunDetail";
import { RequestsList } from "./pages/RequestsList";
import { DirectivesList } from "./pages/DirectivesList";
import { TasksList } from "./pages/TasksList";
import { SetupWizard } from "./pages/SetupWizard";
import { RunnersList } from "./pages/RunnersList";
import { DecisionsList } from "./pages/DecisionsList";

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

  useEffect(() => {
    apiFetch("/api/health")
      .then((r) => r.json())
      .then((data: ApiResponse<{ status: string }>) => {
        setStatus(data.data?.status ?? "unknown");
      })
      .catch(() => setStatus("offline"));
  }, []);

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

function PauseControl() {
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

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
    const interval = setInterval(fetchStatus, 10000); // Poll cada 10s
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
      {loading ? "..." : paused ? "Sistema PAUSADO" : "Sistema ACTIVO"}
    </button>
  );
}

const NAV_ITEMS = [
  { path: "#/runs", label: "Runs", match: "#/runs" },
  { path: "#/tasks", label: "Tasks", match: "#/tasks" },
  { path: "#/runners", label: "Runners", match: "#/runners" },
  { path: "#/directives", label: "Directivas", match: "#/directives" },
  { path: "#/decisions", label: "Decisions", match: "#/decisions" },
  { path: "#/requests", label: "Requests", match: "#/requests" },
  { path: "#/setup", label: "Setup", match: "#/setup" },
];

export function App() {
  const hash = useHash();

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
  } else if (hash === "#/setup") {
    page = <SetupWizard />;
  } else {
    page = <RunsList />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="#/runs" className="text-lg font-bold tracking-tight hover:text-gray-300">
            Elruso
          </a>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`text-sm hover:text-white transition-colors ${
                hash.startsWith(item.match) || (hash === "" && item.match === "#/runs")
                  ? "text-white"
                  : "text-gray-500"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
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
