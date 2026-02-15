interface StatusPillProps {
  status: string;
  label?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

type ColorScheme = { bg: string; text: string; border: string; dot: string };

const STATUS_MAP: Record<string, ColorScheme> = {
  ready: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
  running: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  online: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
  done: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
  active: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
  PROVIDED: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
  APPLIED: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", dot: "bg-green-400" },
  APPROVED: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", dot: "bg-blue-400" },
  failed: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  error: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  REJECTED: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  offline: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-400" },
  blocked: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  MISSING: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  paused: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-400" },
  WAITING: { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30", dot: "bg-slate-400" },
  PENDING_REVIEW: { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-400" },
  deduped: { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30", dot: "bg-slate-400" },
  draft: { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30", dot: "bg-slate-400" },
};

const DEFAULT: ColorScheme = {
  bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30", dot: "bg-slate-400",
};

export function StatusPill({ status, label, size = "sm", pulse = false }: StatusPillProps) {
  const c = STATUS_MAP[status] || DEFAULT;
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClass} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${pulse ? "animate-pulse" : ""}`} />
      {label || status}
    </span>
  );
}
