import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";
import { apiFetch } from "../api";

interface RunnerHeartbeat {
  id: string;
  runner_id: string;
  status: "online" | "offline";
  last_seen_at: string;
  meta?: Record<string, unknown>;
}

export function RunnersList() {
  const [runners, setRunners] = useState<RunnerHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRunners = () => {
    apiFetch("/api/ops/runner/status")
      .then((r) => r.json())
      .then((data: ApiResponse<RunnerHeartbeat[]>) => {
        if (data.ok && data.data) {
          setRunners(data.data);
          setError(null);
        } else {
          setError(data.error ?? "Error desconocido");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRunners();
    const interval = setInterval(fetchRunners, 15000); // Auto-refresh cada 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-400">Cargando runners...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  const onlineCount = runners.filter((r) => r.status === "online").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Runners</h1>
        <div className="text-sm text-gray-400">
          {onlineCount} online / {runners.length} total
        </div>
      </div>

      {runners.length === 0 && (
        <div className="text-gray-500 text-center py-12">
          No hay runners registrados
        </div>
      )}

      <div className="space-y-2">
        {runners.map((runner) => {
          const lastSeen = new Date(runner.last_seen_at);
          const ago = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
          const agoText =
            ago < 60
              ? `${ago}s`
              : ago < 3600
              ? `${Math.floor(ago / 60)}m`
              : `${Math.floor(ago / 3600)}h`;

          return (
            <div
              key={runner.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      runner.status === "online" ? "bg-green-500" : "bg-gray-600"
                    }`}
                  />
                  <div>
                    <div className="font-mono text-sm text-white">
                      {runner.runner_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      Last seen: {agoText} ago
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-xs font-semibold ${
                      runner.status === "online" ? "text-green-400" : "text-gray-500"
                    }`}
                  >
                    {runner.status.toUpperCase()}
                  </div>
                  {runner.meta && Object.keys(runner.meta).length > 0 && (
                    <div className="text-xs text-gray-600 mt-1">
                      {runner.meta.hostname && `@${runner.meta.hostname}`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
