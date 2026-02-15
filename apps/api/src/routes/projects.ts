import type { FastifyInstance } from "fastify";
import type { ApiResponse, Project } from "@elruso/types";
import { getDb } from "../db.js";
import { ensurePlanningRequests } from "../profiles/index.js";

const VALID_PROFILES = ["open", "tiendanube", "waba"];

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

  // POST /ops/projects — create project + wizard_state + planning requests
  app.post<{ Body: { name: string; profile?: string } }>(
    "/ops/projects",
    async (request): Promise<ApiResponse<Project>> => {
      const { name, profile } = request.body as { name?: string; profile?: string };
      if (!name || !name.trim()) {
        return { ok: false, error: "name es requerido" };
      }

      const cleanProfile = profile?.trim() || "open";
      if (!VALID_PROFILES.includes(cleanProfile)) {
        return { ok: false, error: `profile invalido: ${cleanProfile}. Validos: ${VALID_PROFILES.join(", ")}` };
      }

      const db = getDb();

      // 1. Create project
      const { data, error } = await db
        .from("projects")
        .insert({
          name: name.trim(),
          profile: cleanProfile,
        })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };
      const project = data as Project;

      // 2. Create wizard_state for this project (incomplete)
      await db
        .from("wizard_state")
        .upsert(
          {
            project_id: project.id,
            has_completed_wizard: false,
            answers: {},
            current_profile: cleanProfile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id" },
        );

      // 3. Auto-create planning requests for this profile
      await ensurePlanningRequests(db, cleanProfile, undefined, project.id);

      // 4. Log decision
      await db.from("decisions_log").insert({
        source: "system",
        decision_key: "project_created",
        decision_value: {
          project_id: project.id,
          name: project.name,
          profile: cleanProfile,
        },
        context: null,
        project_id: project.id,
      });

      return { ok: true, data: project };
    },
  );

  // DELETE /ops/projects/:id — delete project and related data
  app.delete<{ Params: { id: string } }>(
    "/ops/projects/:id",
    async (request): Promise<ApiResponse<{ deleted: boolean }>> => {
      const { id } = request.params;
      const db = getDb();

      // Verify project exists
      const { data: existing, error: findErr } = await db
        .from("projects")
        .select("id, name")
        .eq("id", id)
        .single();

      if (findErr || !existing) {
        return { ok: false, error: "Proyecto no encontrado" };
      }

      // Delete related data (cascade order)
      await db.from("wizard_state").delete().eq("project_id", id);
      await db.from("requests").delete().eq("project_id", id);
      await db.from("objectives").delete().eq("project_id", id);
      await db.from("decisions_log").delete().eq("project_id", id);

      // Delete project
      const { error: delErr } = await db
        .from("projects")
        .delete()
        .eq("id", id);

      if (delErr) return { ok: false, error: delErr.message };

      return { ok: true, data: { deleted: true } };
    },
  );

  // PATCH /ops/projects/:id — update project (profile NOT editable)
  app.patch<{ Params: { id: string }; Body: { name?: string; profile?: string; is_active?: boolean } }>(
    "/ops/projects/:id",
    async (request): Promise<ApiResponse<Project>> => {
      const { id } = request.params;
      const body = request.body as { name?: string; profile?: string; is_active?: boolean };

      if (body.profile !== undefined) {
        return { ok: false, error: "El perfil no se puede cambiar despues de crear el proyecto" };
      }

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name.trim();
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
