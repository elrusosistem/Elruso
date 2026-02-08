import { useEffect, useState } from "react";
import type { ApiResponse, OpsRequest, RequestStatus } from "@elruso/types";

const STATUS_COLORS: Record<string, string> = {
  WAITING: "bg-yellow-500",
  PROVIDED: "bg-green-500",
  REJECTED: "bg-red-500",
};

export function RequestsList() {
  const [requests, setRequests] = useState<OpsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = () => {
    fetch("/api/ops/requests")
      .then((r) => r.json())
      .then((data: ApiResponse<OpsRequest[]>) => {
        if (data.ok && data.data) setRequests(data.data);
        else setError(data.error ?? "Error cargando requests");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRequests(); }, []);

  const updateStatus = async (id: string, status: RequestStatus) => {
    const res = await fetch(`/api/ops/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data: ApiResponse<OpsRequest> = await res.json();
    if (data.ok) fetchRequests();
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando requests...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Requests</h2>
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.id} className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[req.status] ?? "bg-gray-500"}`} />
                  <span className="font-medium">{req.id}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{req.service}</span>
                </div>
                <p className="text-sm text-gray-300 mb-1">{req.purpose}</p>
                <div className="text-xs text-gray-500">
                  <span>Scopes: {req.scopes.join(", ")}</span>
                  <span className="mx-2">|</span>
                  <span>Set en: {req.where_to_set}</span>
                </div>
                {req.validation_cmd && (
                  <code className="text-xs text-gray-500 block mt-1">$ {req.validation_cmd}</code>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {req.status === "WAITING" && (
                  <>
                    <button
                      onClick={() => updateStatus(req.id, "PROVIDED")}
                      className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 rounded transition-colors"
                    >
                      Provided
                    </button>
                    <button
                      onClick={() => updateStatus(req.id, "REJECTED")}
                      className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 rounded transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                {req.status !== "WAITING" && (
                  <button
                    onClick={() => updateStatus(req.id, "WAITING")}
                    className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
