import type { ReactNode } from "react";

interface AnimatedFadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function AnimatedFadeIn({
  children,
  delay = 0,
  className = "",
}: AnimatedFadeInProps) {
  return (
    <div
      className={`animate-fade-in-up ${className}`}
      style={delay > 0 ? { animationDelay: `${delay}ms`, opacity: 0 } : undefined}
    >
      {children}
    </div>
  );
}
