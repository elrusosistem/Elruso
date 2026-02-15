import type { SupabaseClient } from "@supabase/supabase-js";
import { TIENDANUBE_PLANNING_REQUESTS, type PlanningRequest } from "./tiendanube.js";
import { OPEN_PLANNING_REQUESTS } from "./open.js";
import { WABA_PLANNING_REQUESTS } from "./waba.js";

const PROFILE_REQUESTS: Record<string, PlanningRequest[]> = {
  open: OPEN_PLANNING_REQUESTS,
  tiendanube: TIENDANUBE_PLANNING_REQUESTS,
  waba: WABA_PLANNING_REQUESTS,
};

/**
 * Upserts planning-required requests for the given profile.
 * Idempotent: skips requests already PROVIDED.
 */
export async function ensurePlanningRequests(
  db: SupabaseClient,
  profile: string,
  objectiveId?: string,
  projectId?: string,
): Promise<{ created: string[]; skipped: string[] }> {
  const requests = PROFILE_REQUESTS[profile];
  if (!requests) return { created: [], skipped: [] };

  const created: string[] = [];
  const skipped: string[] = [];

  for (const req of requests) {
    let query = db
      .from("ops_requests")
      .select("id, status")
      .eq("id", req.id);

    if (projectId) query = query.eq("project_id", projectId);

    const { data: existing } = await query.single();

    if (existing && existing.status === "PROVIDED") {
      skipped.push(req.id);
      continue;
    }

    const row: Record<string, unknown> = {
      id: req.id,
      service: req.service,
      type: req.type,
      scopes: req.scopes,
      purpose: req.purpose,
      where_to_set: req.where_to_set,
      validation_cmd: req.validation_cmd,
      required_for_planning: req.required_for_planning,
      objective_id: objectiveId ?? null,
      status: existing?.status || "WAITING",
    };
    if (projectId) row.project_id = projectId;

    await db.from("ops_requests").upsert(row, {
      onConflict: projectId ? "id,project_id" : "id",
    });

    created.push(req.id);
  }

  return { created, skipped };
}

export function getProfileRequiredRequestIds(profile: string): string[] {
  return (PROFILE_REQUESTS[profile] || [])
    .filter((r) => r.required_for_planning)
    .map((r) => r.id);
}
