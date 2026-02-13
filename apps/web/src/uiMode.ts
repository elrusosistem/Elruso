import { useState, useEffect } from "react";

export type UiMode = "operator" | "technical";

const STORAGE_KEY = "elruso_ui_mode";

export function getUiMode(): UiMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "operator" || stored === "technical") return stored;
  return "operator";
}

export function setUiMode(mode: UiMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event("elruso_ui_mode_change"));
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useState<UiMode>(getUiMode);

  useEffect(() => {
    const handler = () => setMode(getUiMode());
    window.addEventListener("elruso_ui_mode_change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("elruso_ui_mode_change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (newMode: UiMode) => {
    setUiMode(newMode);
    setMode(newMode);
  };

  return [mode, update];
}
