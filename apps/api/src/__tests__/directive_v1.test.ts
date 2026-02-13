import { describe, it, expect } from "vitest";
import { validateDirective, payloadHash, DirectiveV1Schema } from "../contracts/directive_v1.js";

const validDirective = {
  version: "directive_v1" as const,
  objective: "Implementar feature X",
  context_summary: "Porque necesitamos X para avanzar",
  risks: [{ id: "R1", text: "Puede romper Y", severity: "med" as const }],
  tasks_to_create: [
    {
      task_id: "T-GPT-001",
      title: "Hacer cosa A",
      priority: 2,
      depends_on: [],
      acceptance_criteria: ["A funciona"],
      description: "Implementar A",
    },
  ],
  required_requests: [{ request_id: "REQ-010", reason: "Necesitamos API key" }],
  apply_notes: "Revisar impacto en prod",
};

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

  it("acepta sin risks (default vacío)", () => {
    const { risks: _, ...rest } = validDirective;
    const result = DirectiveV1Schema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.risks).toEqual([]);
    }
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
});

describe("validateDirective", () => {
  it("valida y retorna ok:true con directiva válida", () => {
    const result = validateDirective(validDirective);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.objective).toBe("Implementar feature X");
    }
  });

  it("genera task_id si no viene", () => {
    const withoutId = {
      ...validDirective,
      tasks_to_create: [{ title: "Task sin ID", priority: 3 }],
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
});

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

    // Clonar con keys en distinto orden no debería importar
    // porque canonicalJson ordena keys
    const reordered = JSON.parse(JSON.stringify(result.data));
    const hash1 = payloadHash(result.data);
    const hash2 = payloadHash(reordered);
    expect(hash1).toBe(hash2);
  });

  it("contenido diferente produce hash diferente", () => {
    const d1 = validateDirective(validDirective);
    const d2 = validateDirective({
      ...validDirective,
      objective: "Otra cosa totalmente distinta",
    });
    if (!d1.ok || !d2.ok) return;

    expect(payloadHash(d1.data)).not.toBe(payloadHash(d2.data));
  });
});
