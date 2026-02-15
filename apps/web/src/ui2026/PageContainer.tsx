import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const WIDTH_MAP: Record<string, string> = {
  sm: "max-w-xl",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  full: "",
};

export function PageContainer({
  children,
  maxWidth = "lg",
  className = "",
}: PageContainerProps) {
  return (
    <div
      className={`p-6 md:p-8 mx-auto animate-fade-in-up ${WIDTH_MAP[maxWidth]} ${className}`}
    >
      {children}
    </div>
  );
}
