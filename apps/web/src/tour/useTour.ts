import { useState, useEffect, useCallback } from "react";
import { useSelectedProject } from "../projectStore";
import { TOUR_STEPS } from "./steps";

const EVENT_NAME = "elruso_tour_change";

function key(suffix: string, projectId: string) {
  return `elruso.tour.${suffix}.${projectId}`;
}

function read(suffix: string, projectId: string): string | null {
  return localStorage.getItem(key(suffix, projectId));
}

function write(suffix: string, projectId: string, value: string) {
  localStorage.setItem(key(suffix, projectId), value);
  window.dispatchEvent(new Event(EVENT_NAME));
}

function remove(suffix: string, projectId: string) {
  localStorage.removeItem(key(suffix, projectId));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export interface TourState {
  active: boolean;
  currentStep: number;
  completed: boolean;
  checkedSteps: Set<string>;
  step: typeof TOUR_STEPS[number] | null;
  totalSteps: number;
}

export interface TourActions {
  start: () => void;
  stop: () => void;
  next: () => void;
  back: () => void;
  goToStep: (index: number) => void;
  markChecked: (stepId: string) => void;
  markCompleted: () => void;
  reset: () => void;
}

function loadState(projectId: string | null): TourState {
  if (!projectId) {
    return { active: false, currentStep: 0, completed: false, checkedSteps: new Set(), step: null, totalSteps: TOUR_STEPS.length };
  }
  const active = read("active", projectId) === "true";
  const currentStep = parseInt(read("step", projectId) ?? "0", 10);
  const completed = read("completed", projectId) === "true";
  const checkedRaw = read("checked", projectId);
  const checkedSteps = new Set<string>(checkedRaw ? JSON.parse(checkedRaw) : []);
  return {
    active,
    currentStep,
    completed,
    checkedSteps,
    step: TOUR_STEPS[currentStep] ?? null,
    totalSteps: TOUR_STEPS.length,
  };
}

export function useTour(): [TourState, TourActions] {
  const [project] = useSelectedProject();
  const projectId = project?.id ?? null;
  const [state, setState] = useState<TourState>(() => loadState(projectId));

  const reload = useCallback(() => {
    setState(loadState(projectId));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, [reload]);

  const start = useCallback(() => {
    if (!projectId) return;
    write("active", projectId, "true");
    write("step", projectId, "0");
    const route = TOUR_STEPS[0].route;
    if (window.location.hash !== route) {
      window.location.hash = route;
    }
  }, [projectId]);

  const stop = useCallback(() => {
    if (!projectId) return;
    write("active", projectId, "false");
  }, [projectId]);

  const goToStep = useCallback((index: number) => {
    if (!projectId) return;
    const clamped = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    write("step", projectId, String(clamped));
    const route = TOUR_STEPS[clamped].route;
    if (window.location.hash !== route) {
      window.location.hash = route;
    }
  }, [projectId]);

  const next = useCallback(() => {
    if (!projectId) return;
    const cur = parseInt(read("step", projectId) ?? "0", 10);
    if (cur < TOUR_STEPS.length - 1) {
      goToStep(cur + 1);
    }
  }, [projectId, goToStep]);

  const back = useCallback(() => {
    if (!projectId) return;
    const cur = parseInt(read("step", projectId) ?? "0", 10);
    if (cur > 0) {
      goToStep(cur - 1);
    }
  }, [projectId, goToStep]);

  const markChecked = useCallback((stepId: string) => {
    if (!projectId) return;
    const checkedRaw = read("checked", projectId);
    const checked: string[] = checkedRaw ? JSON.parse(checkedRaw) : [];
    if (checked.includes(stepId)) {
      const filtered = checked.filter((s) => s !== stepId);
      write("checked", projectId, JSON.stringify(filtered));
    } else {
      checked.push(stepId);
      write("checked", projectId, JSON.stringify(checked));
    }
  }, [projectId]);

  const markCompleted = useCallback(() => {
    if (!projectId) return;
    write("completed", projectId, "true");
    write("active", projectId, "false");
  }, [projectId]);

  const reset = useCallback(() => {
    if (!projectId) return;
    remove("active", projectId);
    remove("step", projectId);
    remove("completed", projectId);
    remove("checked", projectId);
  }, [projectId]);

  return [state, { start, stop, next, back, goToStep, markChecked, markCompleted, reset }];
}
