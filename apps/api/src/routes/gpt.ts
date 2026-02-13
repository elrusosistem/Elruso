import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@elruso/types";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../db.js";
import { getRequestValues } from "../vault.js";
import OpenAI from "openai";

const OPS_DIR = resolve(import.meta.dirname, "../../../../ops");

function readFileSafe(path: string): string {
  if (existsSync(path)) return readFileSync(path, "utf-8");
  return "(archivo no encontrado)";
}

// ─── Componer el prompt de contexto para GPT ──────────────────────
async function composeContext(): Promise<string> {
  // Docs estaticos: siempre de archivos
  const stack = readFileSafe(resolve(OPS_DIR, "STACK.md"));
  const directives = readFileSafe(resolve(OPS_DIR, "DIRECTIVES.md"));
  const decisions = readFileSafe(resolve(OPS_DIR, "DECISIONS.md"));

  // Datos dinamicos: siempre de DB
  const db = getDb();

  const { data: tasks } = await db.from("ops_tasks").select("*").order("id");
  const tasksJson = tasks ? JSON.stringify(tasks, null, 2) : "[]";

  const { data: requests } = await db.from("ops_requests").select("*").order("id");
  const requestsJson = requests ? JSON.stringify(requests, null, 2) : "[]";

  const { data: inbox } = await db.from("ops_directives").select("*").order("created_at", { ascending: false }).limit(10);
  const inboxJson = inbox ? JSON.stringify(inbox, null, 2) : "[]";

  let lastRunSummary = "(sin runs previos)";
  const { data: lastRun } = await db.from("run_logs").select("task_id, status, branch, commit_hash, summary, started_at").order("started_at", { ascending: false }).limit(1).single();
  if (lastRun) {
    lastRunSummary = `Task: ${lastRun.task_id}, Status: ${lastRun.status}, Branch: ${lastRun.branch}, Commit: ${lastRun.commit_hash}, Summary: ${lastRun.summary}`;
  }

  return `# CONTEXTO PARA GPT — El Ruso (Orquestador)

Sos el orquestador estrategico del sistema "El Ruso". Tu rol es analizar el estado actual del proyecto y generar **directivas estructuradas** para que Claude Code las implemente.

## TU OUTPUT REQUERIDO

Responde SOLO con un JSON array de directivas. Sin texto antes ni despues. Cada directiva debe seguir este formato exacto:

\`\`\`json
[
  {
    "id": "DIR-XXX",
    "source": "gpt",
    "title": "Titulo corto (max 120 chars)",
    "body": "Descripcion completa en markdown. Que hacer, como, y por que.",
    "acceptance_criteria": [
      "Criterio verificable 1",
      "Criterio verificable 2"
    ],
    "tasks_to_create": [
      {
        "title": "Titulo de task",
        "phase": 2,
        "depends_on": ["T-XXX"],
        "blocked_by": []
      }
    ]
  }
]
\`\`\`

## REGLAS PARA GENERAR DIRECTIVAS

1. Solo directivas accionables. No filosofia.
2. Cada directiva debe tener acceptance_criteria verificables por CLI.
3. No pedir cosas que esten bloqueadas por REQUESTS sin resolver.
4. Respetar el stack fijo (no proponer cambios de tecnologia).
5. Priorizar: lo que desbloquea mas tareas primero.
6. GPT define, Claude ejecuta, Humano aprueba.
7. Idioma: espanol en toda comunicacion.
8. No crear tasks que ya existan en el backlog.
9. Maximo 3 directivas por respuesta.

---

## STACK
${stack}

## DIRECTIVAS VIGENTES
${directives}

## DECISIONES TOMADAS
${decisions}

## TASKS (backlog)
\`\`\`json
${tasksJson}
\`\`\`

## REQUESTS PENDIENTES
\`\`\`json
${requestsJson}
\`\`\`

## DIRECTIVAS INBOX (historial reciente)
\`\`\`json
${inboxJson}
\`\`\`

## ESTADO ACTUAL
- Ultimo run: ${lastRunSummary}
- Fecha: ${new Date().toISOString()}

---

Analiza el estado y genera directivas. Prioriza lo que mas avanza el proyecto.`;
}

// ─── Parsear respuesta de GPT ─────────────────────────────────────
interface GptDirective {
  id: string;
  source: string;
  title: string;
  body: string;
  acceptance_criteria: string[];
  tasks_to_create: Array<{
    title: string;
    phase: number;
    depends_on: string[];
    blocked_by: string[];
  }>;
}

function parseGptResponse(content: string): GptDirective[] {
  // Extraer JSON del response (puede venir envuelto en ```json...```)
  let json = content.trim();

  // Quitar markdown code fences
  const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    json = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta de GPT no es un JSON array");
  }
  return parsed as GptDirective[];
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

  // POST /ops/gpt/run — pipeline completo: contexto -> GPT -> directivas -> tasks
  app.post("/ops/gpt/run", async (request): Promise<ApiResponse<{
    directives_created: number;
    tasks_created: number;
    directives: GptDirective[];
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  }>> => {
    // 1. Obtener API key del vault
    const openaiValues = getRequestValues("REQ-009");
    const apiKey = openaiValues?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return { ok: false, error: "OPENAI_API_KEY no disponible. Cargar via panel (#/setup) o env var." };
    }

    // 2. Componer contexto
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
            content: "Sos el orquestador estrategico de El Ruso. Responde SOLO con un JSON array de directivas. Sin texto adicional.",
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

    // 4. Parsear directivas
    let directives: GptDirective[];
    try {
      directives = parseGptResponse(gptResponse);
    } catch (e) {
      return { ok: false, error: `Error parseando respuesta de GPT: ${(e as Error).message}. Raw: ${gptResponse.substring(0, 500)}` };
    }

    // 5. Guardar directivas y crear tasks
    const db = getDb();
    let tasksCreated = 0;

    for (const dir of directives) {
      // Guardar directiva
      await db.from("ops_directives").upsert({
        id: dir.id,
        source: "gpt",
        status: "PENDING",
        title: dir.title,
        body: dir.body,
        acceptance_criteria: dir.acceptance_criteria,
        tasks_to_create: dir.tasks_to_create,
        created_at: new Date().toISOString(),
      }, { onConflict: "id" });

      // Crear tasks asociadas
      if (dir.tasks_to_create && dir.tasks_to_create.length > 0) {
        for (const task of dir.tasks_to_create) {
          // Generar ID para la task
          const taskId = `T-GPT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

          await db.from("ops_tasks").insert({
            id: taskId,
            phase: task.phase || 2,
            title: task.title,
            status: "ready",
            branch: `task/${taskId}`,
            depends_on: task.depends_on || [],
            blocked_by: task.blocked_by || [],
            directive_id: dir.id,
          });
          tasksCreated++;
        }
      }
    }

    request.log.info({
      directives: directives.length,
      tasks: tasksCreated,
      model,
      tokens: usage?.total_tokens,
    }, "GPT run completado");

    return {
      ok: true,
      data: {
        directives_created: directives.length,
        tasks_created: tasksCreated,
        directives,
        model,
        usage,
      },
    };
  });
}
