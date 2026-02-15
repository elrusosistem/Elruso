import type { FastifyInstance } from "fastify";
import type { ApiResponse, ActivityEvent } from "@elruso/types";
import { getDb } from "../db.js";
import { redactPatterns } from "../redact.js";
import { getProjectIdOrDefault } from "../projectScope.js";
import { buildActivityStream } from "../activity/activityBuilder.js";

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ops/activity", async (request): Promise<ApiResponse<ActivityEvent[]>> => {
    const projectId = getProjectIdOrDefault(request);
    const url = new URL(request.url, "http://localhost");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Number(limitParam), 100) : 50;

    const db = getDb();
    const { data, error } = await db
      .from("decisions_log")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      request.log.error(error, "Error fetching activity");
      return { ok: false, error: error.message };
    }

    const events = buildActivityStream(data ?? [], limit);

    // Redact raw field
    const redacted = events.map((e) => ({
      ...e,
      raw: e.raw ? JSON.parse(redactPatterns(JSON.stringify(e.raw))) : undefined,
    }));

    return { ok: true, data: redacted };
  });
}
