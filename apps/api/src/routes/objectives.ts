import type { FastifyInstance } from "fastify";
import type { ApiResponse, Objective } from "@elruso/types";
import { getDb } from "../db.js";
import { getProjectIdOrDefault, requireProjectId } from "../projectScope.js";

function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  project_id: string;
}): void {
  const db = getDb();
  db.from("decisions_log")
    .insert({
      source: opts.source,
      decision_key: opts.decision_key,
      decision_value: opts.decision_value,
      context: opts.context ?? null,
      project_id: opts.project_id,
    })
    .then(
      () => {},
      () => {},
    );
}

export async function objectivesRoutes(app: FastifyInstance): Promise<void> {
  // GET /ops/objectives — list (optional ?status=active)
  app.get(
    "/ops/objectives",
    async (request): Promise<ApiResponse<Objective[]>> => {
      const projectId = getProjectIdOrDefault(request);
      const db = getDb();
      const { status } = request.query as { status?: string };

      let query = db
        .from("objectives")
        .select("*")
        .eq("project_id", projectId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error)
        return { ok: false, error: `Error listando objectives: ${error.message}` };
      return { ok: true, data: (data ?? []) as Objective[] };
    },
  );

  // POST /ops/objectives — create
  app.post(
    "/ops/objectives",
    async (request, reply): Promise<ApiResponse<Objective>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return { ok: false, error: "X-Project-Id required" };

      const db = getDb();
      const body = request.body as {
        title?: string;
        description?: string;
        profile?: string;
        priority?: number;
        owner_label?: string;
        status?: string;
      };

      if (!body.title || !body.title.trim()) {
        return { ok: false, error: "title es requerido" };
      }

      const row = {
        title: body.title.trim(),
        description: body.description?.trim() ?? "",
        profile: body.profile ?? "tiendanube",
        priority: body.priority ?? 1,
        owner_label: body.owner_label ?? null,
        status: body.status ?? "draft",
        project_id: projectId,
      };

      const { data, error } = await db
        .from("objectives")
        .insert(row)
        .select("*")
        .single();

      if (error)
        return { ok: false, error: `Error creando objective: ${error.message}` };

      logDecision({
        source: "human",
        decision_key: "objective_created",
        decision_value: {
          objective_id: data.id,
          title: data.title,
          profile: data.profile,
        },
        project_id: projectId,
      });

      return { ok: true, data: data as Objective };
    },
  );

  // PATCH /ops/objectives/:id — update
  app.patch(
    "/ops/objectives/:id",
    async (request, reply): Promise<ApiResponse<Objective>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return { ok: false, error: "X-Project-Id required" };

      const db = getDb();
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        title: string;
        description: string;
        priority: number;
        status: string;
        owner_label: string;
      }>;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.description !== undefined) updates.description = body.description.trim();
      if (body.priority !== undefined) updates.priority = body.priority;
      if (body.status !== undefined) updates.status = body.status;
      if (body.owner_label !== undefined) updates.owner_label = body.owner_label;

      const { data, error } = await db
        .from("objectives")
        .update(updates)
        .eq("id", id)
        .eq("project_id", projectId)
        .select("*")
        .single();

      if (error)
        return { ok: false, error: `Error actualizando objective: ${error.message}` };
      return { ok: true, data: data as Objective };
    },
  );

  // POST /ops/objectives/:id/activate
  app.post(
    "/ops/objectives/:id/activate",
    async (request, reply): Promise<ApiResponse<Objective>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return { ok: false, error: "X-Project-Id required" };

      const db = getDb();
      const { id } = request.params as { id: string };
      const now = new Date().toISOString();

      const { data, error } = await db
        .from("objectives")
        .update({ status: "active", last_reviewed_at: now, updated_at: now })
        .eq("id", id)
        .eq("project_id", projectId)
        .select("*")
        .single();

      if (error)
        return { ok: false, error: `Error activando objective: ${error.message}` };

      logDecision({
        source: "human",
        decision_key: "objective_activated",
        decision_value: {
          objective_id: data.id,
          title: data.title,
        },
        project_id: projectId,
      });

      return { ok: true, data: data as Objective };
    },
  );

  // POST /ops/objectives/:id/pause
  app.post(
    "/ops/objectives/:id/pause",
    async (request, reply): Promise<ApiResponse<Objective>> => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return { ok: false, error: "X-Project-Id required" };

      const db = getDb();
      const { id } = request.params as { id: string };
      const now = new Date().toISOString();

      const { data, error } = await db
        .from("objectives")
        .update({ status: "paused", updated_at: now })
        .eq("id", id)
        .eq("project_id", projectId)
        .select("*")
        .single();

      if (error)
        return { ok: false, error: `Error pausando objective: ${error.message}` };

      logDecision({
        source: "human",
        decision_key: "objective_paused",
        decision_value: {
          objective_id: data.id,
          title: data.title,
        },
        project_id: projectId,
      });

      return { ok: true, data: data as Objective };
    },
  );
}
