import { describe, it, expect } from "vitest";
import type { DecisionLog } from "@elruso/types";
import { buildActivityStream } from "../activity/activityBuilder.js";

function makeRow(overrides: Partial<DecisionLog> & { decision_key: string; created_at: string }): DecisionLog {
  return {
    id: crypto.randomUUID(),
    source: "system",
    decision_value: {},
    context: null,
    run_id: null,
    directive_id: null,
    ...overrides,
  };
}

describe("buildActivityStream", () => {
  it("filters out runner_heartbeat and run_patch_saved", () => {
    const rows: DecisionLog[] = [
      makeRow({ decision_key: "runner_heartbeat", created_at: "2025-01-01T00:01:00Z" }),
      makeRow({ decision_key: "run_patch_saved", created_at: "2025-01-01T00:02:00Z" }),
      makeRow({ decision_key: "task_completed", created_at: "2025-01-01T00:03:00Z" }),
    ];
    const result = buildActivityStream(rows, 50);
    expect(result).toHaveLength(1);
    expect(result[0].decision_key).toBe("task_completed");
  });

  it("groups 3 consecutive task_planned within 60s into count=3 with plural narrative", () => {
    const base = new Date("2025-01-01T00:00:00Z").getTime();
    const rows: DecisionLog[] = [
      makeRow({ decision_key: "task_planned", created_at: new Date(base).toISOString() }),
      makeRow({ decision_key: "task_planned", created_at: new Date(base + 10_000).toISOString() }),
      makeRow({ decision_key: "task_planned", created_at: new Date(base + 20_000).toISOString() }),
    ];
    const result = buildActivityStream(rows, 50);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].narrative).toBe("Se crearon 3 tareas");
  });

  it("does not group events with different decision_key", () => {
    const base = new Date("2025-01-01T00:00:00Z").getTime();
    const rows: DecisionLog[] = [
      makeRow({ decision_key: "task_planned", created_at: new Date(base).toISOString() }),
      makeRow({ decision_key: "task_completed", created_at: new Date(base + 5_000).toISOString() }),
    ];
    const result = buildActivityStream(rows, 50);
    expect(result).toHaveLength(2);
    expect(result[0].decision_key).toBe("task_planned");
    expect(result[1].decision_key).toBe("task_completed");
  });

  it("does not group events separated by more than 60s", () => {
    const base = new Date("2025-01-01T00:00:00Z").getTime();
    const rows: DecisionLog[] = [
      makeRow({ decision_key: "task_planned", created_at: new Date(base).toISOString() }),
      makeRow({ decision_key: "task_planned", created_at: new Date(base + 90_000).toISOString() }),
    ];
    const result = buildActivityStream(rows, 50);
    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(1);
    expect(result[1].count).toBe(1);
  });

  it("maps each decision_key to the correct narrative and event type", () => {
    const cases: Array<{ key: string; narrative: string; type: string }> = [
      { key: "gpt_run_started", narrative: "ElRuso comenzo a analizar el proyecto", type: "plan" },
      { key: "task_completed", narrative: "Finalizo una tarea", type: "task" },
      { key: "run_completed", narrative: "Ejecucion completada", type: "run" },
      { key: "gpt_run_failed", narrative: "Error al generar plan", type: "error" },
      { key: "system_pause", narrative: "Sistema pausado", type: "system" },
      { key: "wizard_completed", narrative: "Configuracion inicial completada", type: "system" },
      { key: "directive_approve", narrative: "Plan aprobado por el usuario", type: "plan" },
      { key: "task_failed", narrative: "Una tarea fallo", type: "error" },
    ];

    for (const c of cases) {
      const rows = [makeRow({ decision_key: c.key, created_at: "2025-01-01T00:00:00Z" })];
      const result = buildActivityStream(rows, 50);
      expect(result[0].narrative, `narrative for ${c.key}`).toBe(c.narrative);
      expect(result[0].type, `type for ${c.key}`).toBe(c.type);
    }
  });
});
