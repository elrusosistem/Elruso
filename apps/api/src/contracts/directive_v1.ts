import { z } from "zod";
import { createHash } from "node:crypto";

// ─── Contrato canónico directive_v1 ───────────────────────────────

export const RiskSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  severity: z.enum(["low", "med", "high"]),
});

export const TaskToCreateSchema = z.object({
  task_id: z.string().min(1).optional(), // Si GPT no lo da, se genera
  title: z.string().min(1),
  priority: z.number().int().min(1).max(5).optional().default(3),
  depends_on: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  description: z.string().optional().default(""),
});

export const RequiredRequestSchema = z.object({
  request_id: z.string().min(1),
  reason: z.string().min(1),
});

export const DirectiveV1Schema = z.object({
  version: z.literal("directive_v1"),
  objective: z.string().min(1),
  context_summary: z.string().optional().default(""),
  risks: z.array(RiskSchema).optional().default([]),
  tasks_to_create: z.array(TaskToCreateSchema).min(1, "tasks_to_create no puede estar vacío"),
  required_requests: z.array(RequiredRequestSchema).optional().default([]),
  apply_notes: z.string().optional().default(""),
});

export type DirectiveV1 = z.infer<typeof DirectiveV1Schema>;
export type TaskToCreate = z.infer<typeof TaskToCreateSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type RequiredRequest = z.infer<typeof RequiredRequestSchema>;

// ─── Hash canónico (determinístico) ───────────────────────────────

/** Serializa JSON de forma canónica (keys ordenadas recursivamente) */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
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
