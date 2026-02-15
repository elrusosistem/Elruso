import { useEffect, useState, useRef, useCallback } from "react";
import { useTour } from "./useTour";
import { TOUR_STEPS, TOUR_TOTAL_MINUTES } from "./steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourOverlay() {
  const [tour, actions] = useTour();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [viewportH, setViewportH] = useState(window.innerHeight);
  const [viewportW, setViewportW] = useState(window.innerWidth);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number>(0);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = tour.step;

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.selector}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Small delay to let scroll settle
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  // Auto-navigate and poll for target
  useEffect(() => {
    if (!tour.active || !step) return;

    // Navigate if needed
    if (window.location.hash !== step.route) {
      window.location.hash = step.route;
    }

    // Poll for the target element (max 2s)
    let attempts = 0;
    const maxAttempts = 40; // 40 * 50ms = 2s
    const poll = () => {
      const el = document.querySelector(`[data-tour="${step.selector}"]`);
      if (el) {
        measure();
        return;
      }
      attempts++;
      if (attempts < maxAttempts) {
        pollRef.current = requestAnimationFrame(poll);
      } else {
        setTargetRect(null); // fallback: centered tooltip
      }
    };
    poll();

    return () => {
      cancelAnimationFrame(pollRef.current);
    };
  }, [tour.active, step, measure]);

  // Re-measure on scroll/resize
  useEffect(() => {
    if (!tour.active) return;

    const onResize = () => {
      setViewportH(window.innerHeight);
      setViewportW(window.innerWidth);
      measure();
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [tour.active, measure]);

  if (!tour.active || !step) return null;

  const pad = 8;
  const isLastStep = tour.currentStep === TOUR_STEPS.length - 1;

  // Spotlight rect (with padding)
  const spot = targetRect
    ? {
        x: targetRect.left - pad,
        y: targetRect.top - pad,
        w: targetRect.width + pad * 2,
        h: targetRect.height + pad * 2,
      }
    : null;

  // Tooltip position
  let tooltipTop = 0;
  let tooltipLeft = 0;
  const tooltipW = 340;

  if (spot) {
    const spaceBelow = viewportH - (spot.y + spot.h);
    if (spaceBelow >= 250) {
      tooltipTop = spot.y + spot.h + 12;
    } else {
      tooltipTop = spot.y - 12; // will be adjusted with transform
    }
    tooltipLeft = Math.max(12, Math.min(spot.x, viewportW - tooltipW - 12));
  } else {
    // Centered fallback
    tooltipTop = viewportH / 2 - 120;
    tooltipLeft = viewportW / 2 - tooltipW / 2;
  }

  const flipUp = spot ? (viewportH - (spot.y + spot.h) < 250) : false;

  return (
    <>
      {/* SVG mask — z-60 */}
      <svg
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 60, width: "100vw", height: "100vh" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.x}
                y={spot.y}
                width={spot.w}
                height={spot.h}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Spotlight glow on target */}
      {spot && (
        <div
          className="fixed pointer-events-none tour-spotlight-glow"
          style={{
            zIndex: 60,
            top: spot.y,
            left: spot.x,
            width: spot.w,
            height: spot.h,
          }}
        />
      )}

      {/* Click blocker — z-61 */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 61 }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Tooltip — z-62 */}
      <div
        ref={tooltipRef}
        className="fixed glass rounded-xl p-4 shadow-2xl border border-[rgba(148,163,184,0.12)]"
        style={{
          zIndex: 62,
          width: tooltipW,
          top: tooltipTop,
          left: tooltipLeft,
          transform: flipUp ? "translateY(-100%)" : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">
            Paso {tour.currentStep + 1} de {tour.totalSteps}
          </span>
          <span className="text-xs text-slate-500">{TOUR_TOTAL_MINUTES}</span>
        </div>

        {/* Progress bar — 10 segments */}
        <div className="flex gap-0.5 mb-3">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background:
                  i <= tour.currentStep
                    ? "linear-gradient(90deg, #6366F1, #06B6D4)"
                    : "rgba(148,163,184,0.1)",
              }}
            />
          ))}
        </div>

        {/* Title + body */}
        <h3 className="text-base font-bold text-white mb-1">{step.title}</h3>
        <p className="text-sm text-slate-300 mb-3">{step.body}</p>
        <span className="text-xs text-slate-500 mb-3 block">~{step.minutes} min</span>

        {/* Checkbox */}
        {step.markable && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={tour.checkedSteps.has(step.id)}
              onChange={() => actions.markChecked(step.id)}
              className="w-4 h-4 rounded border-slate-600 bg-elevated text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
            />
            <span className="text-sm text-slate-300">Marcar como hecho</span>
          </label>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={actions.stop}
            className="px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-slate-200 hover:bg-elevated/50 transition-all"
          >
            Salir
          </button>
          <div className="flex-1" />
          {tour.currentStep > 0 && (
            <button
              onClick={actions.back}
              className="px-3 py-1.5 text-sm rounded-lg glass glass-hover text-slate-300 transition-all"
            >
              Atras
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={actions.markCompleted}
              className="px-4 py-1.5 text-sm rounded-lg font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
            >
              Marcar guia terminada
            </button>
          ) : (
            <button
              onClick={actions.next}
              className="px-4 py-1.5 text-sm rounded-lg font-medium text-white transition-all"
              style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
            >
              Siguiente
            </button>
          )}
        </div>
      </div>
    </>
  );
}
