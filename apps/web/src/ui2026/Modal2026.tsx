import type { ReactNode, MouseEvent } from "react";

interface Modal2026Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal2026({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: Modal2026Props) {
  if (!open) return null;

  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdrop}
    >
      <div
        className={`w-full ${maxWidth} glass rounded-panel p-6 animate-fade-in-up`}
        style={{ background: "rgba(17, 24, 39, 0.85)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
