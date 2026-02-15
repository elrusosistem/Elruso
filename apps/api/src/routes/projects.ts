import type { FastifyInstance } from "fastify";
import type { ApiResponse, Project } from "@elruso/types";
import { getDb } from "../db.js";

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  // GET /ops/projects — list all projects
  app.get("/ops/projects", async (): Promise<ApiResponse<Project[]>> => {
    const db = getDb();
    const { data, error } = await db
      .from("projects")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: data as Project[] };
  });

  // POST /ops/projects — create project
  app.post<{ Body: { name: string; profile?: string } }>(
    "/ops/projects",
    async (request): Promise<ApiResponse<Project>> => {
      const { name, profile } = request.body as { name?: string; profile?: string };
      if (!name || !name.trim()) {
        return { ok: false, error: "name es requerido" };
      }

      const db = getDb();
      const { data, error } = await db
        .from("projects")
        .insert({
          name: name.trim(),
          profile: profile?.trim() || "generic",
        })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as Project };
    },
  );

  // PATCH /ops/projects/:id — update project
  app.patch<{ Params: { id: string }; Body: { name?: string; profile?: string; is_active?: boolean } }>(
    "/ops/projects/:id",
    async (request): Promise<ApiResponse<Project>> => {
      const { id } = request.params;
      const body = request.body as { name?: string; profile?: string; is_active?: boolean };

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.profile !== undefined) updates.profile = body.profile.trim();
      if (body.is_active !== undefined) updates.is_active = body.is_active;

      if (Object.keys(updates).length === 0) {
        return { ok: false, error: "Nada que actualizar" };
      }

      const db = getDb();
      const { data, error } = await db
        .from("projects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data as Project };
    },
  );
}
