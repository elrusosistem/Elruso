import { useState, useEffect } from "react";

const STORAGE_KEY = "elruso_selected_project";
const EVENT_NAME = "elruso_project_change";

export interface SelectedProject {
  id: string;
  name: string;
}

export function getSelectedProject(): SelectedProject | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed.id && parsed.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setSelectedProject(project: SelectedProject | null): void {
  if (project) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useSelectedProject(): [SelectedProject | null, (project: SelectedProject | null) => void] {
  const [project, setProject] = useState<SelectedProject | null>(getSelectedProject);

  useEffect(() => {
    const handler = () => setProject(getSelectedProject());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (newProject: SelectedProject | null) => {
    setSelectedProject(newProject);
    setProject(newProject);
  };

  return [project, update];
}
