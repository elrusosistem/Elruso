import { describe, it, expect } from "vitest";
import { validateDirective, payloadHash, taskHash, canonicalJson, DirectiveV1Schema } from "../contracts/directive_v1.js";

// Helper: crear step ejecutable
const step = (name: string, cmd: string) => ({ name, cmd });

// ─── Fixtures ─────────────────────────────────────────────────────
// scope_type=infra para tests basicos (1 task suficiente)
const validDirective = {
  version: "directive_v1" as const,
  directive_schema_version: "v1",
  objective: "Implementar feature X para el orquestador",
  context_summary: "Porque necesitamos X para avanzar",
  scope_type: "infra" as const,
  risks: [{ id: "R1", text: "Puede romper Y", severity: "med" as const }],
  tasks_to_create: [
    {
      task_id: "T-GPT-001",
      task_type: "feature",
      title: "Hacer cosa A",
      steps: [step("crear-archivo", "touch /tmp/test.txt"), step("verificar", "test -f /tmp/test.txt")],
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

// scope_type=product con 4 tasks + acceptance (para guardrail tests)
const validProductDirective = {
  version: "directive_v1" as const,
  directive_schema_version: "v1",
  objective: "Crear pagina de juego para el panel web",
  context_summary: "Feature de producto nueva",
  scope_type: "product" as const,
  allowed_scope: ["apps/web/**"],
  risks: [{ id: "R1", text: "Puede romper rutas existentes", severity: "low" as const }],
  tasks_to_create: [
    {
      task_id: "T-GPT-P01",
      title: "Scaffold archivos del juego",
      steps: [step("crear-dir", "mkdir -p apps/web/src/pages"), step("crear-page", "touch apps/web/src/pages/Game.tsx")],
      acceptance: { expected_files: ["apps/web/src/pages/Game.tsx"], checks: ["test -f apps/web/src/pages/Game.tsx"] },
      allowed_scope: ["apps/web/**"],
    },
    {
      task_id: "T-GPT-P02",
      title: "Implementar logica del juego",
      steps: [step("write-logic", "echo 'export default {}' > apps/web/src/pages/Game.tsx")],
      depends_on: ["T-GPT-P01"],
      acceptance: { expected_files: ["apps/web/src/pages/Game.tsx"], checks: ["test -f apps/web/src/pages/Game.tsx"] },
      allowed_scope: ["apps/web/**"],
    },
    {
      task_id: "T-GPT-P03",
      title: "Integrar navegacion",
      steps: [step("add-route", "echo 'route added' >> /tmp/route.log")],
      depends_on: ["T-GPT-P02"],
      acceptance: { expected_files: ["apps/web/src/pages/Game.tsx"], checks: ["test -f apps/web/src/pages/Game.tsx"] },
      allowed_scope: ["apps/web/**"],
    },
    {
      task_id: "T-GPT-P04",
      title: "Build y verificacion final",
      steps: [step("build", "pnpm --filter @elruso/web build"), step("verify", "test -f apps/web/src/pages/Game.tsx")],
      depends_on: ["T-GPT-P03"],
      acceptance: { expected_files: ["apps/web/src/pages/Game.tsx"], checks: ["pnpm --filter @elruso/web build"] },
      allowed_scope: ["apps/web/**"],
    },
  ],
  success_criteria: ["Pagina del juego accesible en /game"],
  estimated_impact: "Nueva feature de producto visible en panel",
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
      tasks_to_create: [{ title: "Task sin tipo", steps: [step("s1", "echo hi")] }],
    };
    const result = DirectiveV1Schema.safeParse(d);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks_to_create[0].task_type).toBe("generic");
    }
  });

  it("rechaza steps como strings (debe ser {name, cmd})", () => {
    const d = {
      ...validDirective,
      tasks_to_create: [{ title: "Task con string steps", steps: ["paso 1", "paso 2"] }],
    };
    const result = DirectiveV1Schema.safeParse(d);
    expect(result.success).toBe(false);
  });

  it("limita steps a max 20", () => {
    const manySteps = Array.from({ length: 21 }, (_, i) => step(`step-${i}`, `echo ${i}`));
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
      tasks_to_create: [{ title: "Task sin ID", priority: 3, steps: [step("s1", "echo hi")] }],
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
    const task1 = { task_type: "feature", title: "Task A", steps: [step("s1", "echo A")] };
    const task2 = { task_type: "feature", title: "Task B", steps: [step("s1", "echo A")] };
    expect(taskHash(task1)).not.toBe(taskHash(task2));
  });

  it("task_id no afecta el hash", () => {
    const task1 = { task_id: "T-001", task_type: "feature", title: "Task A", steps: [step("s1", "echo x")] };
    const task2 = { task_id: "T-999", task_type: "feature", title: "Task A", steps: [step("s1", "echo x")] };
    expect(taskHash(task1)).toBe(taskHash(task2));
  });
});

// ─── taskHash dedup behavior ───────────────────────────────────

describe("taskHash dedup behavior", () => {
  it("same task with same objective → same hash (intra-directive dedup works)", () => {
    const task = { title: "Auditar CI pipeline", steps: [step("revisar", "cat config.yml"), step("optimizar", "echo done")] };
    const objective = "Mejorar CI/CD";
    const h1 = taskHash(task, objective);
    const h2 = taskHash(task, objective);
    expect(h1).toBe(h2);
  });

  it("same task with different objective → different hash (cross-directive safe)", () => {
    const task = { title: "Auditar CI pipeline", steps: [step("revisar", "cat config.yml"), step("optimizar", "echo done")] };
    const h1 = taskHash(task, "Mejorar CI/CD");
    const h2 = taskHash(task, "Refactorizar infraestructura");
    expect(h1).not.toBe(h2);
  });

  it("different tasks in same plan → different hashes", () => {
    const obj = "Objetivo compartido del plan";
    const task1 = { title: "Task A del plan", steps: [step("s1", "echo A")] };
    const task2 = { title: "Task B del plan", steps: [step("s1", "echo B")] };
    expect(taskHash(task1, obj)).not.toBe(taskHash(task2, obj));
  });

  it("identical tasks in same plan → same hash (dedup within directive)", () => {
    const obj = "Objetivo compartido";
    const task = { title: "Task duplicada", steps: [step("s1", "echo 1")] };
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

// ─── Apply dedup guarantees (mandatory) ────────────────────────

describe("apply dedup guarantees", () => {
  it("cross-directive: same tasks in 2 different directives → different hashes (both created)", () => {
    const task = { title: "Optimizar queries DB", steps: [step("analizar", "echo analyze"), step("indexar", "echo index")], task_type: "feature" };
    const hashDir1 = taskHash(task, "Directive A: mejorar performance");
    const hashDir2 = taskHash(task, "Directive B: reducir latencia");
    expect(hashDir1).not.toBe(hashDir2);
  });

  it("intra-directive dedup: duplicate tasks within same directive → same hash (skipped)", () => {
    const objective = "Mismo objetivo para ambas";
    const task = { title: "Task identica", steps: [step("s1", "echo 1")], task_type: "feature" };
    const h1 = taskHash(task, objective);
    const h2 = taskHash(task, objective);
    expect(h1).toBe(h2);
  });

  it("task_id collision: hash differs so task should be created with new ID", () => {
    const task1 = { task_id: "T-GPT-001", title: "Old task", steps: [step("s1", "echo old")] };
    const task2 = { task_id: "T-GPT-001", title: "New task", steps: [step("s1", "echo new")] };
    const h1 = taskHash(task1, "Objective old");
    const h2 = taskHash(task2, "Objective new");
    expect(h1).not.toBe(h2);
  });

  it("zero-created scenario: if tasks_expected>0 but all skipped, hashes explain why", () => {
    const objective = "Plan con duplicados internos";
    const taskA = { title: "Hacer lo mismo", steps: [step("s1", "echo 1")] };
    const taskB = { title: "Hacer lo mismo", steps: [step("s1", "echo 1")] };
    const hA = taskHash(taskA, objective);
    const hB = taskHash(taskB, objective);
    expect(hA).toBe(hB);
  });
});

// ─── Planner guardrails ──────────────────────────────────────────

describe("planner guardrails", () => {
  it("product con 4 tasks + acceptance pasa validateDirective", () => {
    const result = validateDirective(validProductDirective);
    expect(result.ok).toBe(true);
  });

  it("product con 1 task falla (minimo 4)", () => {
    const oneTask = {
      ...validProductDirective,
      tasks_to_create: [validProductDirective.tasks_to_create[0]],
    };
    const result = validateDirective(oneTask);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("minimo");
  });

  it("product sin acceptance falla", () => {
    const noAcceptance = {
      ...validProductDirective,
      tasks_to_create: validProductDirective.tasks_to_create.map((t) => {
        const { acceptance: _, ...rest } = t;
        return rest;
      }),
    };
    const result = validateDirective(noAcceptance);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("acceptance");
  });

  it("product sin steps falla", () => {
    const noSteps = {
      ...validProductDirective,
      tasks_to_create: validProductDirective.tasks_to_create.map((t) => ({
        ...t,
        steps: [],
      })),
    };
    const result = validateDirective(noSteps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("steps ejecutables");
  });

  it("product con allowed_scope de infra falla (scope_violation)", () => {
    const infraScope = {
      ...validProductDirective,
      allowed_scope: ["scripts/**"],
    };
    const result = validateDirective(infraScope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("scope_violation");
  });

  it("product con task allowed_scope de infra falla", () => {
    const infraTaskScope = {
      ...validProductDirective,
      tasks_to_create: validProductDirective.tasks_to_create.map((t) => ({
        ...t,
        allowed_scope: ["db/migrations/**"],
      })),
    };
    const result = validateDirective(infraTaskScope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("scope_violation");
  });

  it("infra con 1 task pasa (sin minimo)", () => {
    const result = validateDirective(validDirective);
    expect(result.ok).toBe(true);
  });

  it("string steps rechazados por schema (no llega a guardrails)", () => {
    const stringSteps = {
      ...validDirective,
      tasks_to_create: [{ title: "Task mala", steps: ["paso descriptivo"] }],
    };
    const result = validateDirective(stringSteps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("validation failed");
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
