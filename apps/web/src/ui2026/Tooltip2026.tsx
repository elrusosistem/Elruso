import { useState, type ReactNode } from "react";

interface Tooltip2026Props {
  text: string;
  children: ReactNode;
  position?: "top" | "bottom";
}

export function Tooltip2026({ text, children, position = "top" }: Tooltip2026Props) {
  const [show, setShow] = useState(false);

  const posClass = position === "top"
    ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
    : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className={`absolute z-50 ${posClass} glass rounded-md px-3 py-1.5 text-xs text-slate-200 whitespace-nowrap animate-fade-in pointer-events-none`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
