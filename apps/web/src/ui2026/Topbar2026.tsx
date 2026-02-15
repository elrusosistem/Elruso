import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { useSelectedProject } from "../projectStore";
import { TourTopbarButton } from "../tour";

interface Topbar2026Props {
  pageTitle: string;
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

  if (isOp) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs">
      <span className={`w-1.5 h-1.5 rounded-full ${status === "healthy" ? "bg-green-400" : "bg-red-400"}`} />
      <span className="text-slate-300">API: {status}</span>
    </div>
  );
}

function RunnerBadge() {
  const [online, setOnline] = useState(0);
  const [total, setTotal] = useState(0);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    const f = () => {
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
    f();
    const interval = setInterval(f, 30000);
    return () => clearInterval(interval);
  }, []);

  if (total === 0) return null;

  const isOffline = online === 0;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
      isOp && isOffline ? "bg-red-500/15 border border-red-500/20 text-red-300" : "glass"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? "bg-red-400" : "bg-green-400"} ${!isOffline ? "animate-pulse" : ""}`} />
      <span className={isOffline ? "text-red-300" : "text-slate-300"}>
        {isOp
          ? (isOffline ? "Agente apagado" : "Agente activo")
          : `Runner: ${isOffline ? "OFFLINE" : `${online} ONLINE`}`}
      </span>
    </div>
  );
}

function PauseControl() {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
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
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all duration-200 ${
        paused
          ? "bg-red-500/15 border border-red-500/20 text-red-300 hover:bg-red-500/25"
          : "glass glass-hover text-slate-300"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${paused ? "bg-red-400" : "bg-green-400"}`} />
      {loading ? "..." : isOp
        ? (paused ? "Pausado" : "Activo")
        : (paused ? "Sistema PAUSADO" : "Sistema ACTIVO")}
    </button>
  );
}

function ModeToggle() {
  const [mode, setMode] = useUiMode();
  return (
    <div className="inline-flex items-center rounded-full glass text-xs overflow-hidden">
      <button
        onClick={() => setMode("operator")}
        className={`px-3 py-1.5 transition-all duration-200 ${
          mode === "operator"
            ? "bg-accent-primary text-white"
            : "text-slate-500 hover:text-slate-200"
        }`}
      >
        Operador
      </button>
      <button
        onClick={() => setMode("technical")}
        className={`px-3 py-1.5 transition-all duration-200 ${
          mode === "technical"
            ? "bg-accent-primary text-white"
            : "text-slate-500 hover:text-slate-200"
        }`}
      >
        Tecnico
      </button>
    </div>
  );
}

function ProjectBadge() {
  const [project] = useSelectedProject();

  if (!project) {
    return (
      <a
        href="#/projects"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/15 border border-yellow-500/20 text-yellow-300 text-xs hover:bg-yellow-500/25 transition-all duration-200"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Sin proyecto
      </a>
    );
  }

  return (
    <a
      href="#/projects"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass glass-hover text-xs text-slate-300"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
      {project.name}
    </a>
  );
}

export function Topbar2026({ pageTitle }: Topbar2026Props) {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[rgba(148,163,184,0.06)]"
      style={{ background: "rgba(11, 15, 26, 0.5)", backdropFilter: "blur(12px)" }}
    >
      <h1 className="text-sm font-semibold text-slate-200 tracking-wide">{pageTitle}</h1>
      <div className="flex items-center gap-2">
        <ProjectBadge />
        <TourTopbarButton />
        <ModeToggle />
        <RunnerBadge />
        <PauseControl />
        <StatusBadge />
      </div>
    </header>
  );
}
