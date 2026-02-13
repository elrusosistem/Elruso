import { z } from "zod";
import { createHash } from "node:crypto";

// ─── Contrato canónico directive_v1 ───────────────────────────────

export const RiskSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(500),
  severity: z.enum(["low", "med", "high"]),
});

export const TaskToCreateSchema = z.object({
  task_id: z.string().min(1).optional(), // Si GPT no lo da, se genera
  task_type: z.string().min(1).max(50).optional().default("generic"),
  title: z.string().min(1).max(200),
  steps: z.array(z.string().max(500)).max(20).optional().default([]),
  depends_on: z.array(z.string()).optional().default([]),
  priority: z.number().int().min(1).max(5).optional().default(3),
  phase: z.number().int().min(0).max(99).optional(),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  // Legacy fields (accepted but not required)
  acceptance_criteria: z.array(z.string()).optional().default([]),
  description: z.string().max(2000).optional().default(""),
});

export const RequiredRequestSchema = z.object({
  request_id: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export const DirectiveV1Schema = z.object({
  version: z.literal("directive_v1"),
  directive_schema_version: z.string().optional().default("v1"),
  objective: z.string().min(10).max(500),
  context_summary: z.string().max(2000).optional().default(""),
  risks: z.array(RiskSchema).min(1, "Se requiere al menos 1 riesgo"),
  tasks_to_create: z.array(TaskToCreateSchema).min(1, "tasks_to_create no puede estar vacío"),
  required_requests: z.array(RequiredRequestSchema).optional().default([]),
  success_criteria: z.array(z.string().min(1).max(500)).min(1, "Se requiere al menos 1 criterio de éxito"),
  estimated_impact: z.string().min(1).max(500),
  apply_notes: z.string().max(1000).optional().default(""),
});

export type DirectiveV1 = z.infer<typeof DirectiveV1Schema>;
export type TaskToCreate = z.infer<typeof TaskToCreateSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type RequiredRequest = z.infer<typeof RequiredRequestSchema>;

// ─── Hash canónico (determinístico) ───────────────────────────────

/** Serializa JSON de forma canónica (keys ordenadas recursivamente) */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return JSON.stringify(obj ?? null);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    sorted
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

/** SHA-256 del JSON canónico */
export function payloadHash(payload: DirectiveV1): string {
  const canonical = canonicalJson(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

/** SHA-256 hash para una task individual (dedup por contenido) */
export function taskHash(task: Partial<TaskToCreate> & { title: string }, directiveObjective?: string): string {
  const key = canonicalJson({
    task_type: task.task_type || "generic",
    title: task.title,
    steps: task.steps || [],
    params: task.params || {},
    directive_objective: directiveObjective || "",
  });
  return createHash("sha256").update(key).digest("hex");
}

// ─── Validar + normalizar ─────────────────────────────────────────

/** Valida y normaliza una directiva. Genera task_ids si faltan. */
export function validateDirective(raw: unknown): { ok: true; data: DirectiveV1 } | { ok: false; error: string } {
  const result = DirectiveV1Schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: `directive_v1 validation failed: ${issues}` };
  }

  const directive = result.data;

  // Generar task_id si no viene
  for (const task of directive.tasks_to_create) {
    if (!task.task_id) {
      task.task_id = `T-GPT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
  }

  return { ok: true, data: directive };
}
