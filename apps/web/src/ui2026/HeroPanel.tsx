import type { ReactNode } from "react";

interface HeroPanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function HeroPanel({ title, subtitle, actions, className = "" }: HeroPanelProps) {
  return (
    <div
      className={`rounded-hero p-6 md:p-8 mb-8 ${className}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 50%, rgba(6,182,212,0.06) 100%)",
        border: "1px solid rgba(99,102,241,0.15)",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
