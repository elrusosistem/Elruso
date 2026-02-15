import type { ReactNode, MouseEvent } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: "primary" | "success" | "error" | "warning" | "none";
  hover?: boolean;
  onClick?: (e: MouseEvent) => void;
}

const GLOW_MAP: Record<string, string> = {
  primary: "glow-primary",
  success: "glow-success",
  error: "glow-error",
  warning: "glow-warning",
};

export function GlassCard({
  children,
  className = "",
  glow = "none",
  hover = false,
  onClick,
}: GlassCardProps) {
  const glowClass = GLOW_MAP[glow] || "";
  const hoverClass = hover ? "glass-hover cursor-pointer" : "";
  const clickClass = onClick ? "cursor-pointer" : "";

  return (
    <div
      className={`glass rounded-card p-5 transition-all duration-200 ${glowClass} ${hoverClass} ${clickClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
