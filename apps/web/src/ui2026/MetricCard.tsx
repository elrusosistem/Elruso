import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  glow?: "primary" | "success" | "error" | "warning" | "none";
  icon?: ReactNode;
  className?: string;
}

const GLOW_MAP: Record<string, string> = {
  primary: "glow-primary",
  success: "glow-success",
  error: "glow-error",
  warning: "glow-warning",
};

export function MetricCard({
  label,
  value,
  sub,
  color = "text-white",
  glow = "none",
  icon,
  className = "",
}: MetricCardProps) {
  const glowClass = GLOW_MAP[glow] || "";

  return (
    <div className={`glass rounded-card p-5 transition-all duration-200 ${glowClass} ${className}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">
          {label}
        </span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold mt-2 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
