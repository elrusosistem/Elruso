import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "../../db.js";
import { DEFAULT_PROJECT_ID } from "../../projectScope.js";

export const TEST_PREFIX = "TEST-E2E-";
export const TEST_PROJECT_ID = DEFAULT_PROJECT_ID;

/** Common headers for scoped test requests */
export const TEST_HEADERS = {
  "x-project-id": TEST_PROJECT_ID,
};

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

  // Reset wizard_state for test project
  await client
    .from("wizard_state")
    .update({
      has_completed_wizard: false,
      answers: {},
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", TEST_PROJECT_ID);

  // Delete test requests
  await client.from("ops_requests").delete().like("id", `${TEST_PREFIX}%`);
}

export async function seedWizardCompleted(db?: SupabaseClient): Promise<void> {
  const client = db ?? getDb();
  await client.from("wizard_state").upsert(
    {
      project_id: TEST_PROJECT_ID,
      has_completed_wizard: true,
      answers: { what_to_achieve: "Test E2E", profile: "tiendanube" },
      current_profile: "tiendanube",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
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
      project_id: TEST_PROJECT_ID,
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
      project_id: TEST_PROJECT_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id,project_id" },
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
      project_id: TEST_PROJECT_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id,project_id" },
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
