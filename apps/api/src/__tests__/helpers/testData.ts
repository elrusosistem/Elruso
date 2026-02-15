import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "../../db.js";

export const TEST_PREFIX = "TEST-E2E-";

export async function cleanupTestData(db?: SupabaseClient): Promise<void> {
  const client = db ?? getDb();

  // Delete test tasks
  await client.from("ops_tasks").delete().like("id", `${TEST_PREFIX}%`);

  // Delete test directives
  await client.from("ops_directives").delete().like("id", `${TEST_PREFIX}%`);

  // Delete test objectives
  await client.from("objectives").delete().like("id", `${TEST_PREFIX}%`);

  // Delete test decisions
  await client
    .from("decisions_log")
    .delete()
    .like("directive_id", `${TEST_PREFIX}%`);

  // Reset wizard_state for tests
  await client
    .from("wizard_state")
    .update({
      has_completed_wizard: false,
      answers: {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  // Delete test requests
  await client.from("ops_requests").delete().like("id", `${TEST_PREFIX}%`);
}

export async function seedWizardCompleted(db?: SupabaseClient): Promise<void> {
  const client = db ?? getDb();
  await client.from("wizard_state").upsert(
    {
      id: 1,
      has_completed_wizard: true,
      answers: { what_to_achieve: "Test E2E", profile: "tiendanube" },
      current_profile: "tiendanube",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function seedActiveObjective(
  db?: SupabaseClient,
): Promise<string> {
  const client = db ?? getDb();
  const id = `${TEST_PREFIX}OBJ-1`;

  await client.from("objectives").upsert(
    {
      id,
      title: "Test E2E Objective",
      description: "Objective for E2E tests",
      profile: "tiendanube",
      priority: 1,
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  return id;
}

export async function seedPlanningRequests(
  db?: SupabaseClient,
  provided = false,
): Promise<void> {
  const client = db ?? getDb();
  const status = provided ? "PROVIDED" : "WAITING";

  await client.from("ops_requests").upsert(
    {
      id: `${TEST_PREFIX}REQ-TN-STORE`,
      service: "tiendanube",
      type: "credentials",
      scopes: ["TIENDANUBE_STORE_ID", "TIENDANUBE_STORE_URL"],
      purpose: "Test store credentials",
      where_to_set: "vault",
      validation_cmd: "",
      status,
      required_for_planning: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  await client.from("ops_requests").upsert(
    {
      id: `${TEST_PREFIX}REQ-TN-TOKEN`,
      service: "tiendanube",
      type: "credentials",
      scopes: ["TIENDANUBE_ACCESS_TOKEN"],
      purpose: "Test access token",
      where_to_set: "vault",
      validation_cmd: "",
      status,
      required_for_planning: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export const TEST_DIRECTIVE_PAYLOAD = {
  version: "directive_v1" as const,
  directive_schema_version: "v1",
  objective: "Test E2E directive — automatizar publicaciones de productos",
  context_summary: "Test context for E2E pipeline validation",
  risks: [
    { id: "R1", text: "Test risk for E2E", severity: "low" as const },
  ],
  tasks_to_create: [
    {
      task_id: `${TEST_PREFIX}TASK-1`,
      task_type: "feature",
      title: "Test task from E2E directive",
      steps: ["Step 1", "Step 2"],
      depends_on: [],
      priority: 3,
      phase: 0,
      params: {},
      acceptance_criteria: ["Test passes"],
      description: "E2E test task",
    },
  ],
  required_requests: [],
  success_criteria: ["E2E test passes"],
  estimated_impact: "Validates E2E pipeline",
  apply_notes: "Test only",
};
