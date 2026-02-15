import { describe, it, expect } from "vitest";
import { validateDirective, payloadHash, taskHash, canonicalJson, DirectiveV1Schema } from "../contracts/directive_v1.js";

// ─── Fixtures ─────────────────────────────────────────────────────
const validDirective = {
  version: "directive_v1" as const,
  directive_schema_version: "v1",
  objective: "Implementar feature X para el orquestador",
  context_summary: "Porque necesitamos X para avanzar",
  risks: [{ id: "R1", text: "Puede romper Y", severity: "med" as const }],
  tasks_to_create: [
    {
      task_id: "T-GPT-001",
      task_type: "feature",
      title: "Hacer cosa A",
      steps: ["Paso 1: crear archivo", "Paso 2: implementar"],
      priority: 2,
      depends_on: [],
      acceptance_criteria: ["A funciona"],
      description: "Implementar A",
    },
  ],
  required_requests: [{ request_id: "REQ-010", reason: "Necesitamos API key" }],
  success_criteria: ["Feature X funciona end-to-end"],
  estimated_impact: "Desbloquea el pipeline completo de GPT",
  apply_notes: "Revisar impacto en prod",
};

// ─── DirectiveV1Schema ──────────────────────────────────────────

describe("DirectiveV1Schema", () => {
  it("acepta una directiva válida completa", () => {
    const result = DirectiveV1Schema.safeParse(validDirective);
    expect(result.success).toBe(true);
  });

  it("rechaza version incorrecta", () => {
    const result = DirectiveV1Schema.safeParse({ ...validDirective, version: "v2" });
    expect(result.success).toBe(false);
  });

  it("rechaza tasks_to_create vacío", () => {
    const result = DirectiveV1Schema.safeParse({ ...validDirective, tasks_to_create: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza sin objective", () => {
    const { objective: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rechaza objective corto (< 10 chars)", () => {
    const result = DirectiveV1Schema.safeParse({ ...validDirective, objective: "corto" });
    expect(result.success).toBe(false);
  });

  it("rechaza risks vacío", () => {
    const result = DirectiveV1Schema.safeParse({ ...validDirective, risks: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza sin risks (required now)", () => {
    const { risks: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rechaza sin success_criteria", () => {
    const { success_criteria: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rechaza success_criteria vacío", () => {
    const result = DirectiveV1Schema.safeParse({ ...validDirective, success_criteria: [] });
    expect(result.success).toBe(false);
  });

  it("rechaza sin estimated_impact", () => {
    const { estimated_impact: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("acepta sin required_requests (default vacío)", () => {
    const { required_requests: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rechaza severity inválida en risks", () => {
    const bad = {
      ...validDirective,
      risks: [{ id: "R1", text: "risk", severity: "critical" }],
    };
    const result = DirectiveV1Schema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("acepta task_type default 'generic'", () => {
    const d = {
      ...validDirective,
      tasks_to_create: [{ title: "Task sin tipo", steps: ["paso 1"] }],
    };
    const result = DirectiveV1Schema.safeParse(d);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks_to_create[0].task_type).toBe("generic");
    }
  });

  it("limita steps a max 20", () => {
    const manySteps = Array.from({ length: 21 }, (_, i) => `Paso ${i + 1}`);
    const d = {
      ...validDirective,
      tasks_to_create: [{ title: "Task con muchos steps", steps: manySteps }],
    };
    const result = DirectiveV1Schema.safeParse(d);
    expect(result.success).toBe(false);
  });

  it("limita title a max 200 chars", () => {
    const d = {
      ...validDirective,
      tasks_to_create: [{ title: "x".repeat(201) }],
    };
    const result = DirectiveV1Schema.safeParse(d);
    expect(result.success).toBe(false);
  });

  it("acepta directive_schema_version default 'v1'", () => {
    const { directive_schema_version: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.directive_schema_version).toBe("v1");
    }
  });
});

// ─── validateDirective ──────────────────────────────────────────

describe("validateDirective", () => {
  it("valida y retorna ok:true con directiva válida", () => {
    const result = validateDirective(validDirective);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.objective).toBe("Implementar feature X para el orquestador");
    }
  });

  it("genera task_id si no viene", () => {
    const withoutId = {
      ...validDirective,
      tasks_to_create: [{ title: "Task sin ID", priority: 3, steps: ["paso 1"] }],
    };
    const result = validateDirective(withoutId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tasks_to_create[0].task_id).toMatch(/^T-GPT-/);
    }
  });

  it("retorna ok:false con data inválida", () => {
    const result = validateDirective({ version: "directive_v1", objective: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("validation failed");
    }
  });

  it("retorna ok:false si falta estimated_impact", () => {
    const { estimated_impact: _, ...rest } = validDirective;
    const result = validateDirective(rest);
    expect(result.ok).toBe(false);
  });

  it("retorna ok:false si risks vacío", () => {
    const result = validateDirective({ ...validDirective, risks: [] });
    expect(result.ok).toBe(false);
  });
});

// ─── payloadHash ────────────────────────────────────────────────

describe("payloadHash", () => {
  it("genera hash determinístico", () => {
    const result = validateDirective(validDirective);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const hash1 = payloadHash(result.data);
    const hash2 = payloadHash(result.data);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it("mismo contenido con keys en distinto orden produce mismo hash", () => {
    const result = validateDirective(validDirective);
    if (!result.ok) return;

    const reordered = JSON.parse(JSON.stringify(result.data));
    const hash1 = payloadHash(result.data);
    const hash2 = payloadHash(reordered);
    expect(hash1).toBe(hash2);
  });

  it("contenido diferente produce hash diferente", () => {
    const d1 = validateDirective(validDirective);
    const d2 = validateDirective({
      ...validDirective,
      objective: "Otra cosa totalmente distinta para el orquestador",
    });
    if (!d1.ok || !d2.ok) return;

    expect(payloadHash(d1.data)).not.toBe(payloadHash(d2.data));
  });
});

// ─── taskHash ───────────────────────────────────────────────────

describe("taskHash", () => {
  it("genera hash determinístico para una task", () => {
    const task = validDirective.tasks_to_create[0];
    const hash1 = taskHash(task);
    const hash2 = taskHash(task);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("mismo task con distinto directiveObjective produce distinto hash", () => {
    const task = validDirective.tasks_to_create[0];
    const h1 = taskHash(task, "objetivo A");
    const h2 = taskHash(task, "objetivo B");
    expect(h1).not.toBe(h2);
  });

  it("distintos tasks producen distinto hash", () => {
    const task1 = { task_type: "feature", title: "Task A", steps: ["step 1"] };
    const task2 = { task_type: "feature", title: "Task B", steps: ["step 1"] };
    expect(taskHash(task1)).not.toBe(taskHash(task2));
  });

  it("task_id no afecta el hash", () => {
    const task1 = { task_id: "T-001", task_type: "feature", title: "Task A", steps: ["x"] };
    const task2 = { task_id: "T-999", task_type: "feature", title: "Task A", steps: ["x"] };
    expect(taskHash(task1)).toBe(taskHash(task2));
  });
});

// ─── taskHash dedup behavior ───────────────────────────────────

describe("taskHash dedup behavior", () => {
  it("same task with same objective → same hash (intra-directive dedup works)", () => {
    const task = { title: "Auditar CI pipeline", steps: ["Revisar config", "Optimizar"] };
    const objective = "Mejorar CI/CD";
    const h1 = taskHash(task, objective);
    const h2 = taskHash(task, objective);
    expect(h1).toBe(h2);
  });

  it("same task with different objective → different hash (cross-directive safe)", () => {
    const task = { title: "Auditar CI pipeline", steps: ["Revisar config", "Optimizar"] };
    const h1 = taskHash(task, "Mejorar CI/CD");
    const h2 = taskHash(task, "Refactorizar infraestructura");
    expect(h1).not.toBe(h2);
  });

  it("different tasks in same plan → different hashes", () => {
    const obj = "Objetivo compartido del plan";
    const task1 = { title: "Task A del plan", steps: ["Hacer A"] };
    const task2 = { title: "Task B del plan", steps: ["Hacer B"] };
    expect(taskHash(task1, obj)).not.toBe(taskHash(task2, obj));
  });

  it("identical tasks in same plan → same hash (dedup within directive)", () => {
    const obj = "Objetivo compartido";
    const task = { title: "Task duplicada", steps: ["Paso 1"] };
    expect(taskHash(task, obj)).toBe(taskHash(task, obj));
  });

  it("params affect hash", () => {
    const obj = "Objetivo";
    const task1 = { title: "Task", steps: [], params: { env: "prod" } };
    const task2 = { title: "Task", steps: [], params: { env: "staging" } };
    expect(taskHash(task1, obj)).not.toBe(taskHash(task2, obj));
  });

  it("task_type affects hash", () => {
    const obj = "Objetivo";
    const task1 = { title: "Task", task_type: "feature", steps: [] };
    const task2 = { title: "Task", task_type: "bugfix", steps: [] };
    expect(taskHash(task1, obj)).not.toBe(taskHash(task2, obj));
  });
});

// ─── canonicalJson ──────────────────────────────────────────────

describe("canonicalJson", () => {
  it("ordena keys alfabeticamente", () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it("maneja null y undefined", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(undefined)).toBe("null");
  });

  it("maneja arrays", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("maneja nested objects", () => {
    const result = canonicalJson({ b: { z: 1, a: 2 }, a: 1 });
    expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
  });
});
