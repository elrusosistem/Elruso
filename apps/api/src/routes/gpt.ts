import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@elruso/types";
import { getDb } from "../db.js";
import { getRequestValues } from "../vault.js";
import { validateDirective, payloadHash } from "../contracts/directive_v1.js";
import type { DirectiveV1 } from "../contracts/directive_v1.js";
import OpenAI from "openai";

// ─── Compose mínimo y estable ─────────────────────────────────────
// Solo: system status, metrics, tasks pendientes, requests abiertas,
// últimos 3 runs (summary), NO logs crudos, NO diffs, NO secrets.

async function composeContext(): Promise<string> {
  const db = getDb();

  // System status
  const { data: sysState } = await db.from("ops_state").select("value").eq("key", "system_paused").single();
  const paused = sysState ? sysState.value === true || sysState.value === "true" : false;

  // Tasks resumen
  const { data: tasks } = await db.from("ops_tasks").select("id, title, status, depends_on").order("id");
  const tasksByStatus: Record<string, number> = {};
  const pendingTasks: { id: string; title: string; depends_on: string[] }[] = [];
  for (const t of tasks || []) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
    if (t.status === "ready" || t.status === "blocked") {
      pendingTasks.push({ id: t.id, title: t.title, depends_on: t.depends_on || [] });
    }
  }

  // Requests abiertas
  const { data: requests } = await db.from("ops_requests").select("id, service, purpose, status").order("id");
  const waitingRequests = (requests || []).filter((r) => r.status === "WAITING");

  // Últimos 3 runs (solo summary)
  const { data: lastRuns } = await db
    .from("run_logs")
    .select("task_id, status, summary, started_at")
    .order("started_at", { ascending: false })
    .limit(3);

  const runsSummary = (lastRuns || []).map((r) =>
    `- ${r.task_id}: ${r.status} — ${r.summary || "(sin summary)"}`
  ).join("\n");

  // Directivas recientes PENDING_REVIEW (para no duplicar)
  const { data: pendingDirs } = await db
    .from("ops_directives")
    .select("id, title, status")
    .in("status", ["PENDING_REVIEW", "APPROVED"])
    .order("created_at", { ascending: false })
    .limit(5);

  const pendingDirsSummary = (pendingDirs || []).map((d) =>
    `- ${d.id}: [${d.status}] ${d.title}`
  ).join("\n") || "(ninguna)";

  return `# CONTEXTO — El Ruso (Orquestador)

Sos el orquestador estrategico. Analiza el estado y genera directivas.

## OUTPUT REQUERIDO

Responde SOLO con un JSON array. Sin texto antes ni despues. Cada elemento sigue el contrato directive_v1:

\`\`\`json
[
  {
    "version": "directive_v1",
    "objective": "Que hay que lograr (max 200 chars)",
    "context_summary": "Por que ahora y que contexto tiene",
    "risks": [{"id":"R1","text":"Descripcion del riesgo","severity":"low|med|high"}],
    "tasks_to_create": [
      {
        "task_id": "T-GPT-<unico>",
        "title": "Titulo de la task",
        "priority": 3,
        "depends_on": ["T-XXX"],
        "acceptance_criteria": ["Criterio verificable"],
        "description": "Que hacer concretamente"
      }
    ],
    "required_requests": [{"request_id":"REQ-XXX","reason":"Por que se necesita"}],
    "apply_notes": "Notas para el humano que aprueba"
  }
]
\`\`\`

## REGLAS

1. Solo directivas accionables. No filosofia.
2. tasks_to_create NO puede estar vacio si la directiva pretende cambios.
3. No pedir cosas bloqueadas por REQUESTS sin resolver.
4. Stack fijo: Node 22, TypeScript, Fastify, Supabase, Vite+React+Tailwind.
5. Priorizar: lo que desbloquea mas tareas primero.
6. Idioma: espanol. Max 3 directivas.
7. No crear tasks que ya existan (ver backlog).
8. No duplicar directivas pendientes de review.

---

## ESTADO DEL SISTEMA

- Pausado: ${paused ? "SI" : "NO"}
- Fecha: ${new Date().toISOString()}

## TASKS (resumen)
${Object.entries(tasksByStatus).map(([s, c]) => `- ${s}: ${c}`).join("\n") || "- (vacío)"}

### Pendientes (ready + blocked)
${pendingTasks.map((t) => `- ${t.id}: ${t.title}${t.depends_on.length ? ` [deps: ${t.depends_on.join(",")}]` : ""}`).join("\n") || "- (ninguna)"}

## REQUESTS ABIERTAS
${waitingRequests.map((r) => `- ${r.id}: ${r.service} — ${r.purpose}`).join("\n") || "- (ninguna pendiente)"}

## DIRECTIVAS PENDIENTES (no duplicar)
${pendingDirsSummary}

## ÚLTIMOS RUNS
${runsSummary || "- (sin runs)"}

---

Analiza y genera directivas. Prioriza lo que mas avanza el proyecto.`;
}

// ─── Parsear respuesta de GPT → directive_v1[] ────────────────────

function parseAndValidateGptResponse(content: string): { directives: DirectiveV1[]; errors: string[] } {
  let json = content.trim();

  // Quitar markdown code fences si existen
  const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    json = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta de GPT no es un JSON array");
  }

  const directives: DirectiveV1[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const result = validateDirective(parsed[i]);
    if (result.ok) {
      directives.push(result.data);
    } else {
      errors.push(`Directiva[${i}]: ${result.error}`);
    }
  }

  return { directives, errors };
}

// ─── Routes ───────────────────────────────────────────────────────
export async function gptRoutes(app: FastifyInstance): Promise<void> {

  // POST /ops/gpt/compose — genera el prompt de contexto (sin llamar a GPT)
  app.post("/ops/gpt/compose", async (): Promise<ApiResponse<{ prompt: string; char_count: number }>> => {
    try {
      const prompt = await composeContext();
      return { ok: true, data: { prompt, char_count: prompt.length } };
    } catch (e) {
      return { ok: false, error: `Error componiendo contexto: ${(e as Error).message}` };
    }
  });

  // POST /ops/gpt/run — pipeline: contexto → GPT → validate directive_v1 → persist PENDING_REVIEW
  app.post("/ops/gpt/run", async (request): Promise<ApiResponse<{
    directives_created: number;
    validation_errors: string[];
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  }>> => {
    // 1. API key
    const openaiValues = getRequestValues("REQ-009");
    const apiKey = openaiValues?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "OPENAI_API_KEY no disponible." };
    }

    // 2. Compose
    let prompt: string;
    try {
      prompt = await composeContext();
    } catch (e) {
      return { ok: false, error: `Error componiendo contexto: ${(e as Error).message}` };
    }

    // 3. Llamar a OpenAI
    const openai = new OpenAI({ apiKey });
    let gptResponse: string;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
    const model = "gpt-4.1";

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "Sos el orquestador estrategico de El Ruso. Responde SOLO con un JSON array siguiendo el contrato directive_v1. Sin texto adicional.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      gptResponse = completion.choices[0]?.message?.content ?? "";
      if (completion.usage) {
        usage = {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        };
      }
    } catch (e) {
      return { ok: false, error: `Error llamando a OpenAI: ${(e as Error).message}` };
    }

    if (!gptResponse) {
      return { ok: false, error: "GPT devolvio respuesta vacia" };
    }

    // 4. Parsear + validar con zod
    let directives: DirectiveV1[];
    let validationErrors: string[];
    try {
      const result = parseAndValidateGptResponse(gptResponse);
      directives = result.directives;
      validationErrors = result.errors;
    } catch (e) {
      return { ok: false, error: `Error parseando respuesta de GPT: ${(e as Error).message}. Raw: ${gptResponse.substring(0, 500)}` };
    }

    if (directives.length === 0) {
      return {
        ok: false,
        error: `Ninguna directiva pasó validación. Errores: ${validationErrors.join(" | ")}`,
      };
    }

    // 5. Persistir directivas validadas
    const db = getDb();
    const now = new Date().toISOString();

    for (const directive of directives) {
      const hash = payloadHash(directive);
      const directiveId = `DIR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      await db.from("ops_directives").insert({
        id: directiveId,
        source: "gpt",
        status: "PENDING_REVIEW",
        title: directive.objective.substring(0, 120),
        body: directive.context_summary || directive.objective,
        acceptance_criteria: directive.tasks_to_create.flatMap((t) => t.acceptance_criteria),
        tasks_to_create: directive.tasks_to_create,
        payload_json: directive,
        payload_hash: hash,
        created_at: now,
      });
    }

    request.log.info({
      directives_created: directives.length,
      validation_errors: validationErrors.length,
      model,
      tokens: usage?.total_tokens,
    }, "GPT run completado (directive_v1)");

    return {
      ok: true,
      data: {
        directives_created: directives.length,
        validation_errors: validationErrors,
        model,
        usage,
      },
    };
  });
}
