import type { SupabaseClient } from "@supabase/supabase-js";
import { TIENDANUBE_PLANNING_REQUESTS, type PlanningRequest } from "./tiendanube.js";

const PROFILE_REQUESTS: Record<string, PlanningRequest[]> = {
  tiendanube: TIENDANUBE_PLANNING_REQUESTS,
};

/**
 * Upserts planning-required requests for the given profile.
 * Idempotent: skips requests already PROVIDED.
 */
export async function ensurePlanningRequests(
  db: SupabaseClient,
  profile: string,
  objectiveId?: string,
): Promise<{ created: string[]; skipped: string[] }> {
  const requests = PROFILE_REQUESTS[profile];
  if (!requests) return { created: [], skipped: [] };

  const created: string[] = [];
  const skipped: string[] = [];

  for (const req of requests) {
    const { data: existing } = await db
      .from("ops_requests")
      .select("id, status")
      .eq("id", req.id)
      .single();

    if (existing && existing.status === "PROVIDED") {
      skipped.push(req.id);
      continue;
    }

    await db.from("ops_requests").upsert(
      {
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
      },
      { onConflict: "id" },
    );

    created.push(req.id);
  }

  return { created, skipped };
}

export function getProfileRequiredRequestIds(profile: string): string[] {
  return (PROFILE_REQUESTS[profile] || [])
    .filter((r) => r.required_for_planning)
    .map((r) => r.id);
}
