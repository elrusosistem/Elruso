import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";

interface Directive {
  id: string;
  created_at: string;
  source: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  title: string;
  body: string;
  acceptance_criteria: string[];
  tasks_to_create: { title: string; phase: number }[];
  applied_at: string | null;
  rejection_reason: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-blue-500",
  APPLIED: "bg-green-500",
  REJECTED: "bg-red-500",
};

export function DirectivesList() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectives = () => {
    fetch("/api/ops/directives")
      .then((r) => r.json())
      .then((data: ApiResponse<Directive[]>) => {
        if (data.ok && data.data) setDirectives(data.data);
        else setError(data.error ?? "Error cargando directives");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDirectives(); }, []);

  const updateStatus = async (id: string, status: string, rejection_reason?: string) => {
    await fetch(`/api/ops/directives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejection_reason }),
    });
    fetchDirectives();
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando directivas...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  if (directives.length === 0) {
    return (
      <div className="p-8 text-gray-500">
        <h2 className="text-2xl font-bold mb-4 text-white">Directivas</h2>
        <p>Sin directivas en el inbox.</p>
        <p className="text-sm mt-2">
          Generar con: <code className="bg-gray-800 px-1 rounded">./scripts/compose_gpt_prompt.sh</code>
          {" "}&rarr; GPT &rarr;{" "}
          <code className="bg-gray-800 px-1 rounded">./scripts/apply_gpt_directives.sh</code>
        </p>
      </div>
    );
  }

  const selectedDir = selected ? directives.find((d) => d.id === selected) : null;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Directivas</h2>
      <div className="flex gap-6">
        {/* Lista */}
        <div className="w-1/3 space-y-2">
          {directives.map((dir) => (
            <button
              key={dir.id}
              onClick={() => setSelected(dir.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selected === dir.id ? "bg-gray-700" : "bg-gray-800 hover:bg-gray-750"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[dir.status]}`} />
                <span className="font-medium text-sm">{dir.id}</span>
                <span className="text-xs text-gray-500">{dir.source}</span>
              </div>
              <div className="text-sm truncate">{dir.title}</div>
            </button>
          ))}
        </div>

        {/* Detalle */}
        <div className="flex-1">
          {selectedDir ? (
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[selectedDir.status]}`} />
                <h3 className="text-lg font-semibold">{selectedDir.title}</h3>
                <span className="text-xs px-2 py-0.5 bg-gray-700 rounded uppercase">
                  {selectedDir.status}
                </span>
              </div>

              <div className="text-sm text-gray-300 mb-4 whitespace-pre-wrap">
                {selectedDir.body}
              </div>

              {selectedDir.acceptance_criteria.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Criterios de aceptacion</h4>
                  <ul className="text-sm space-y-1">
                    {selectedDir.acceptance_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-gray-600 mt-0.5">-</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDir.tasks_to_create.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 text-gray-400">Tasks a crear</h4>
                  <ul className="text-sm space-y-1">
                    {selectedDir.tasks_to_create.map((t, i) => (
                      <li key={i} className="text-gray-300">
                        Fase {t.phase}: {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDir.status === "PENDING" && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => updateStatus(selectedDir.id, "APPLIED")}
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-sm transition-colors"
                  >
                    Marcar como Aplicada
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Razon de rechazo:");
                      if (reason !== null) updateStatus(selectedDir.id, "REJECTED", reason);
                    }}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-600 mt-4">
                Creada: {new Date(selectedDir.created_at).toLocaleString("es-AR")}
                {selectedDir.applied_at && (
                  <> | Aplicada: {new Date(selectedDir.applied_at).toLocaleString("es-AR")}</>
                )}
                {selectedDir.rejection_reason && (
                  <> | Razon: {selectedDir.rejection_reason}</>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">Seleccionar una directiva para ver detalle.</div>
          )}
        </div>
      </div>
    </div>
  );
}
