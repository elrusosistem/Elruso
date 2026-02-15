import { useEffect, useState, useCallback } from "react";
import type { ApiResponse, ActivityEvent, ActivityEventType } from "@elruso/types";
import { apiFetch } from "../api";
import { GlassCard } from "../ui2026";

const DOT_COLORS: Record<ActivityEventType, string> = {
  plan: "bg-violet-400",
  task: "bg-cyan-400",
  run: "bg-green-400",
  error: "bg-red-400",
  system: "bg-slate-400",
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const MAX_VISIBLE = 10;

export function ActivityStream() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchActivity = useCallback(() => {
    apiFetch("/api/ops/activity?limit=30")
      .then((r) => r.json())
      .then((data: ApiResponse<ActivityEvent[]>) => {
        if (data.ok && data.data) setEvents(data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 15_000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  if (events.length === 0) {
    return (
      <GlassCard className="!p-0 overflow-hidden">
        <p className="text-sm text-slate-500 p-4">Sin actividad reciente.</p>
      </GlassCard>
    );
  }

  const visible = events.slice(0, MAX_VISIBLE);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <GlassCard className="!p-0 overflow-hidden">
      <div className="px-4 py-3 space-y-0">
        {visible.map((evt, i) => (
          <div key={evt.id} className="flex items-start gap-3 group">
            {/* Time */}
            <span className="text-xs text-slate-500 font-mono w-12 pt-0.5 flex-shrink-0 text-right">
              {formatTime(evt.timestamp)}
            </span>

            {/* Dot + Line */}
            <div className="flex flex-col items-center flex-shrink-0">
              <span className={`w-2 h-2 rounded-full mt-1.5 ${DOT_COLORS[evt.type]}`} />
              {i < visible.length - 1 && (
                <div className="w-px bg-slate-700/50 flex-1 min-h-[20px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 pb-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200">{evt.narrative}</span>
                {evt.count > 1 && (
                  <span className="text-xs text-slate-500">({evt.count})</span>
                )}
              </div>

              {/* Tech detail toggle */}
              <button
                onClick={() => toggleExpand(evt.id)}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors mt-0.5"
              >
                {expanded.has(evt.id) ? "ocultar" : "ver detalles"}
              </button>

              {expanded.has(evt.id) && (
                <pre className="mt-1 text-xs text-slate-500 bg-black/20 rounded p-2 overflow-x-auto max-h-32">
                  {JSON.stringify({ decision_key: evt.decision_key, raw: evt.raw }, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {events.length > MAX_VISIBLE && (
        <div className="px-4 pb-3">
          <a
            href="#/decisions"
            className="text-xs text-accent-primary hover:text-indigo-300 transition-colors"
          >
            Ver todo ({events.length} eventos)
          </a>
        </div>
      )}
    </GlassCard>
  );
}
