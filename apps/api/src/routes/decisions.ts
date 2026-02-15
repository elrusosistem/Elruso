import type { FastifyInstance } from "fastify";
import type { ApiResponse, DecisionLog } from "@elruso/types";
import { getDb } from "../db.js";
import { redactPatterns } from "../redact.js";
import { getProjectIdOrDefault, requireProjectId } from "../projectScope.js";

// Campos que pueden contener secretos y necesitan redacción
const REDACT_FIELDS = ["decision_value", "context"];

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...row };
  for (const field of REDACT_FIELDS) {
    if (clean[field] && typeof clean[field] === "object") {
      clean[field] = JSON.parse(redactPatterns(JSON.stringify(clean[field])));
    }
  }
  return clean;
}

export async function decisionsRoutes(app: FastifyInstance): Promise<void> {
  // POST /ops/decisions — crear decision
  app.post<{
    Body: {
      source?: string;
      decision_key: string;
      decision_value: Record<string, unknown>;
      context?: Record<string, unknown>;
      run_id?: string;
      directive_id?: string;
    };
  }>("/ops/decisions", async (request, reply): Promise<ApiResponse<DecisionLog>> => {
    const projectId = requireProjectId(request, reply);
    if (!projectId) return { ok: false, error: "X-Project-Id required" };

    const body = request.body as {
      source?: string;
      decision_key: string;
      decision_value: Record<string, unknown>;
      context?: Record<string, unknown>;
      run_id?: string;
      directive_id?: string;
    };

    if (!body.decision_key) {
      return { ok: false, error: "decision_key es requerido" };
    }

    const validSources = ["gpt", "human", "system", "runner"];
    const source = body.source || "system";
    if (!validSources.includes(source)) {
      return { ok: false, error: `source invalido. Opciones: ${validSources.join(", ")}` };
    }

    const entry = {
      source,
      decision_key: body.decision_key,
      decision_value: body.decision_value ?? {},
      context: body.context ?? null,
      run_id: body.run_id ?? null,
      directive_id: body.directive_id ?? null,
      project_id: projectId,
    };

    const db = getDb();
    const { data, error } = await db
      .from("decisions_log")
      .insert(entry)
      .select()
      .single();

    if (error) {
      request.log.error(error, "Error creando decision");
      return { ok: false, error: error.message };
    }

    return { ok: true, data: redactRow(data) as unknown as DecisionLog };
  });

  // GET /ops/decisions — listar decisions con filtros
  app.get("/ops/decisions", async (request): Promise<ApiResponse<DecisionLog[]>> => {
    const projectId = getProjectIdOrDefault(request);
    const url = new URL(request.url, "http://localhost");
    const runId = url.searchParams.get("run_id");
    const directiveId = url.searchParams.get("directive_id");
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");

    const limit = limitParam ? Math.min(Number(limitParam), 100) : 50;
    const offset = offsetParam ? Number(offsetParam) : 0;

    const db = getDb();
    let query = db
      .from("decisions_log")
      .select("*", { count: "exact" })
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (runId) {
      query = query.eq("run_id", runId);
    }
    if (directiveId) {
      query = query.eq("directive_id", directiveId);
    }

    const { data, error, count } = await query;

    if (error) {
      request.log.error(error, "Error listando decisions");
      return { ok: false, error: error.message };
    }

    const redacted = (data ?? []).map((row) => redactRow(row) as unknown as DecisionLog);

    return {
      ok: true,
      data: redacted,
      meta: { total: count ?? 0, page: Math.floor(offset / limit), per_page: limit },
    };
  });
}
