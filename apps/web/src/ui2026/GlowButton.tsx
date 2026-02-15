import type { ReactNode, MouseEvent } from "react";

interface GlowButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
}

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-accent-primary hover:bg-indigo-400 text-white glow-btn",
  secondary:
    "bg-elevated border border-[rgba(148,163,184,0.08)] hover:border-[rgba(148,163,184,0.2)] text-slate-200",
  danger: "bg-red-600/80 hover:bg-red-500 text-white",
  ghost:
    "bg-transparent hover:bg-elevated text-slate-400 hover:text-white",
};

const SIZE_CLASSES: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-5 py-2.5 text-sm rounded-card font-medium",
  lg: "px-8 py-3 text-sm rounded-card font-medium",
};

export function GlowButton({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
}: GlowButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} transition-all duration-200 ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}
