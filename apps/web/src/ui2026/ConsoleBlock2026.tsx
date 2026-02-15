import { useState } from "react";

interface ConsoleBlock2026Props {
  title?: string;
  content: string;
  maxHeight?: string;
  className?: string;
}

export function ConsoleBlock2026({
  title,
  content,
  maxHeight = "300px",
  className = "",
}: ConsoleBlock2026Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`rounded-card border border-[rgba(148,163,184,0.08)] overflow-hidden ${className}`}
      style={{ background: "#0A0E18" }}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(148,163,184,0.06)]">
          <span className="text-xs text-slate-500 font-medium">{title}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
      <pre
        className="p-4 text-xs text-slate-300 font-mono overflow-auto whitespace-pre-wrap"
        style={{ maxHeight }}
      >
        {content}
      </pre>
    </div>
  );
}
