import { useEffect, useState } from "react";
import type { ApiResponse, RunDetail as RunDetailType, FileChange } from "@elruso/types";
import { apiFetch } from "../api";
import { useUiMode } from "../uiMode";
import { humanizeRunStatus } from "../humanize";

const STATUS_COLORS: Record<string, string> = {
  running: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
  blocked: "text-yellow-400",
  deduped: "text-gray-500",
};

export function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [showPatch, setShowPatch] = useState(false);
  const [mode] = useUiMode();
  const isOp = mode === "operator";

  useEffect(() => {
    apiFetch(`/api/runs/${runId}`)
      .then((r) => r.json())
      .then((data: ApiResponse<RunDetailType>) => {
        if (data.ok && data.data) {
          setRun(data.data);
        } else {
          setError(data.error ?? "Run no encontrado");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;
  if (error || !run) {
    return (
      <div className="p-8">
        <a href="#/runs" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
          &larr; Volver
        </a>
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          {error ?? "Run no encontrado"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <a href="#/runs" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
        &larr; {isOp ? "Volver a ejecuciones" : "Volver"}
      </a>

      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {isOp ? `Ejecucion de ${run.task_id}` : run.task_id}
        </h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className={`font-medium ${isOp ? "" : "uppercase"} ${STATUS_COLORS[run.status] ?? "text-gray-400"}`}>
            {isOp
              ? (run.status === "done" ? "Resultado: OK" : run.status === "failed" ? "Resultado: Fallo" : humanizeRunStatus(run.status))
              : run.status}
          </span>
          {!isOp && run.branch && (
            <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-300">
              {run.branch}
            </span>
          )}
          {!isOp && run.commit_hash && (
            <span className="font-mono text-gray-400">
              {run.commit_hash.slice(0, 8)}
            </span>
          )}
          <span className="text-gray-500">
            {new Date(run.started_at).toLocaleString("es-AR")}
          </span>
          {run.finished_at && (
            <span className="text-gray-500">
              &rarr; {new Date(run.finished_at).toLocaleString("es-AR")}
            </span>
          )}
        </div>
        {run.pr_url && (
          <a
            href={run.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-sm mt-2 inline-block"
          >
            Ver PR
          </a>
        )}
        {run.summary && (
          <p className="mt-3 text-gray-300 bg-gray-800 rounded-lg p-3 text-sm">
            {run.summary}
          </p>
        )}
      </div>

      {/* Steps — hide in operator mode */}
      {!isOp && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3">
            Steps ({run.steps.length})
          </h3>
          {run.steps.length === 0 ? (
            <p className="text-gray-500 text-sm">Sin steps registrados.</p>
          ) : (
            <div className="space-y-2">
              {run.steps.map((step) => (
                <div key={step.id} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{step.step_name}</span>
                    {step.exit_code !== null && (
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded ${
                          step.exit_code === 0
                            ? "bg-green-900/40 text-green-400"
                            : "bg-red-900/40 text-red-400"
                        }`}
                      >
                        exit {step.exit_code}
                      </span>
                    )}
                  </div>
                  {step.cmd && (
                    <code className="text-xs text-gray-400 block mb-1">
                      $ {step.cmd}
                    </code>
                  )}
                  {step.output_excerpt && (
                    <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap max-h-40 overflow-auto">
                      {step.output_excerpt}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Changes */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3">
          {isOp ? `Que cambio (${run.file_changes.length})` : `Archivos (${run.file_changes.length})`}
        </h3>
        {run.file_changes.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {isOp ? "Sin cambios registrados." : "Sin cambios de archivos registrados."}
          </p>
        ) : (
          <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
            {run.file_changes.map((fc) => {
              const changeLabel = isOp
                ? { added: "Nuevo", deleted: "Eliminado", renamed: "Renombrado", modified: "Modificado" }[fc.change_type] ?? fc.change_type
                : fc.change_type[0].toUpperCase();
              return (
                <div key={fc.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        isOp ? "" : "font-mono"
                      } ${
                        fc.change_type === "added"
                          ? "bg-green-900/40 text-green-400"
                          : fc.change_type === "deleted"
                            ? "bg-red-900/40 text-red-400"
                            : fc.change_type === "renamed"
                              ? "bg-blue-900/40 text-blue-400"
                              : "bg-yellow-900/40 text-yellow-400"
                      }`}
                    >
                      {changeLabel}
                    </span>
                    <span className={`${isOp ? "text-gray-300" : "font-mono text-gray-300"} truncate`}>
                      {isOp ? fc.path.split("/").pop() : fc.path}
                    </span>
                  </div>
                  {!isOp && fc.diffstat && (
                    <pre className="text-xs text-gray-500 mt-1 ml-8 whitespace-pre-wrap">{fc.diffstat}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Patch Forense — technical only by default, operator can toggle */}
      {run.artifact_path && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            {isOp ? "Detalle tecnico" : "Patch Forense"}
          </h3>
          <button
            onClick={() => {
              if (showPatch) {
                setShowPatch(false);
              } else {
                apiFetch(`/api/runs/${runId}/artifacts/patch`)
                  .then((r) => r.json())
                  .then((data: ApiResponse<{ patch: string }>) => {
                    if (data.ok && data.data) {
                      setPatch(data.data.patch);
                      setShowPatch(true);
                    }
                  })
                  .catch(() => setPatch("Error cargando patch"));
              }
            }}
            className="text-sm px-3 py-1.5 bg-purple-800 hover:bg-purple-700 rounded transition-colors mb-3"
          >
            {showPatch ? "Ocultar" : isOp ? "Ver detalles tecnicos" : "Ver patch redacted"}
          </button>
          {showPatch && patch && (
            <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 overflow-auto max-h-96 whitespace-pre font-mono">
              {patch}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
