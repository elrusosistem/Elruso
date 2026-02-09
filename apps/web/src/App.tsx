import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { RunsList } from "./pages/RunsList";
import { RunDetail } from "./pages/RunDetail";
import { RequestsList } from "./pages/RequestsList";
import { DirectivesList } from "./pages/DirectivesList";
import { TasksList } from "./pages/TasksList";
import { SetupWizard } from "./pages/SetupWizard";

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
    fetch("/api/health")
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

const NAV_ITEMS = [
  { path: "#/runs", label: "Runs", match: "#/runs" },
  { path: "#/tasks", label: "Tasks", match: "#/tasks" },
  { path: "#/directives", label: "Directivas", match: "#/directives" },
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
  } else if (hash === "#/tasks") {
    page = <TasksList />;
  } else if (hash === "#/setup") {
    page = <SetupWizard />;
  } else {
    page = <RunsList />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
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
        <StatusBadge />
      </nav>
      {page}
    </div>
  );
}
