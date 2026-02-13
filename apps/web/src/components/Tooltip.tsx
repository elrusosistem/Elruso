import { useState } from "react";

interface Props {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: Props) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-200 whitespace-nowrap z-50 pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}
