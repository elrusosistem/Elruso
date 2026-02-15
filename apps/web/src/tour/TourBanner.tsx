import { useTour } from "./useTour";
import { TOUR_TOTAL_MINUTES } from "./steps";

export function TourTopbarButton() {
  const [tour, actions] = useTour();

  // Don't show if tour overlay is already active
  if (tour.active) return null;

  if (tour.completed) {
    return (
      <button
        onClick={actions.start}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass glass-hover text-xs text-slate-400 transition-all duration-200"
      >
        Guia
      </button>
    );
  }

  return (
    <button
      onClick={actions.start}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200"
      style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)" }}
    >
      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-indigo-300 bg-indigo-500/30">
        ?
      </span>
      <span className="text-indigo-300">Guia ({TOUR_TOTAL_MINUTES})</span>
    </button>
  );
}
