import { useEffect, useState } from "react";
import type { ApiResponse } from "@elruso/types";

export function App() {
  const [status, setStatus] = useState<string>("loading...");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: ApiResponse<{ status: string }>) => {
        setStatus(data.data?.status ?? "unknown");
      })
      .catch(() => setStatus("offline"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Elruso</h1>
        <p className="text-lg text-gray-400">Control Center</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "healthy" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          API: {status}
        </div>
      </div>
    </div>
  );
}
