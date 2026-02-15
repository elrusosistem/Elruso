import type { ReactNode } from "react";

export interface ActivityItem {
  id: string;
  icon: "success" | "error" | "info" | "warning" | "neutral";
  label: string;
  source?: string;
  timestamp?: string;
  detail?: ReactNode;
}

interface ActivityFeed2026Props {
  items: ActivityItem[];
  maxItems?: number;
}

const DOT_COLORS: Record<string, string> = {
  success: "bg-green-400",
  error: "bg-red-400",
  info: "bg-blue-400",
  warning: "bg-yellow-400",
  neutral: "bg-slate-400",
};

const SOURCE_COLORS: Record<string, string> = {
  human: "text-blue-400 bg-blue-500/15 border-blue-500/20",
  system: "text-slate-400 bg-slate-500/15 border-slate-500/20",
  runner: "text-green-400 bg-green-500/15 border-green-500/20",
  gpt: "text-violet-400 bg-violet-500/15 border-violet-500/20",
};

export function ActivityFeed2026({ items, maxItems }: ActivityFeed2026Props) {
  const visible = maxItems ? items.slice(0, maxItems) : items;

  return (
    <div className="space-y-1">
      {visible.map((item, i) => (
        <div key={item.id} className="flex items-start gap-3 py-2.5 px-3 rounded-card transition-colors hover:bg-elevated/50 group">
          {/* Timeline dot + line */}
          <div className="flex flex-col items-center mt-1.5">
            <div className={`w-2 h-2 rounded-full ${DOT_COLORS[item.icon]}`} />
            {i < visible.length - 1 && (
              <div className="w-px h-full min-h-[16px] bg-slate-700/50 mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-200 truncate">{item.label}</span>
              {item.source && (
                <span className={`text-xs px-1.5 py-0.5 rounded border ${SOURCE_COLORS[item.source] || SOURCE_COLORS.system}`}>
                  {item.source}
                </span>
              )}
            </div>
            {item.timestamp && (
              <span className="text-xs text-slate-500">{item.timestamp}</span>
            )}
            {item.detail && (
              <div className="mt-2 text-xs text-slate-400">{item.detail}</div>
            )}
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">Sin actividad</div>
      )}
    </div>
  );
}
