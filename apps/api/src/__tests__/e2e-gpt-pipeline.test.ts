import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  cleanupTestData,
  seedWizardCompleted,
  seedActiveObjective,
  seedPlanningRequests,
  TEST_PREFIX,
  TEST_DIRECTIVE_PAYLOAD,
} from "./helpers/testData.js";

// Mock OpenAI at module level
vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify([TEST_DIRECTIVE_PAYLOAD]),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
            },
          }),
        },
      };
    },
  };
});

describe.skipIf(!process.env.SUPABASE_URL)("E2E GPT Pipeline", () => {
  let app: FastifyInstance;
  let createdDirectiveId: string | null = null;

  beforeAll(async () => {
    // Dynamic import after mock is set up
    const { buildTestApp } = await import("./helpers/buildTestApp.js");
    app = await buildTestApp();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  // ── Caso 1: Sin objetivo activo → bloquea GPT run ──
  it("blocks GPT run when no active objectives", async () => {
    await seedWizardCompleted();
    await seedPlanningRequests(undefined, true);
    // No active objective seeded

    const res = await app.inject({
      method: "POST",
      url: "/ops/gpt/run",
    });

    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("No hay objetivos activos");
  });

  // ── Caso 2: Objetivo activo + request faltante → bloquea GPT run ──
  it("blocks GPT run when required requests are missing", async () => {
    await seedWizardCompleted();
    await seedActiveObjective();
    await seedPlanningRequests(undefined, false); // status=WAITING

    const res = await app.inject({
      method: "POST",
      url: "/ops/gpt/run",
    });

    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Faltan datos de configuracion");
  });

  // ── Caso 3: Todo completo → GPT run exitoso (mock) ──
  it("runs GPT pipeline successfully with mocked OpenAI", async () => {
    await seedWizardCompleted();
    await seedActiveObjective();
    await seedPlanningRequests(undefined, true); // status=PROVIDED

    // Need OPENAI_API_KEY in env for the route to proceed
    process.env.OPENAI_API_KEY = "test-key-for-e2e";

    const res = await app.inject({
      method: "POST",
      url: "/ops/gpt/run",
    });

    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.directives_created).toBeGreaterThanOrEqual(1);

    // Verify directive exists in DB
    const { getDb } = await import("../../src/db.js");
    const db = getDb();
    const { data: directives } = await db
      .from("ops_directives")
      .select("id, source, status")
      .eq("source", "gpt")
      .eq("status", "PENDING_REVIEW")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(directives).toBeTruthy();
    expect(directives!.length).toBeGreaterThanOrEqual(1);
    createdDirectiveId = directives![0].id;
  });

  // ── Caso 4: Aprobar y aplicar directiva → crea tasks ──
  it("approves and applies directive creating tasks", async () => {
    expect(createdDirectiveId).toBeTruthy();

    // Approve
    const approveRes = await app.inject({
      method: "PATCH",
      url: `/ops/directives/${createdDirectiveId}`,
      payload: { status: "APPROVED" },
    });
    expect(approveRes.json().ok).toBe(true);

    // Apply
    const applyRes = await app.inject({
      method: "POST",
      url: `/ops/directives/${createdDirectiveId}/apply`,
    });

    const body = applyRes.json();
    expect(body.ok).toBe(true);
    expect(body.data.tasks_created).toBeGreaterThanOrEqual(1);
    expect(body.data.idempotent).toBe(false);

    // Verify tasks in DB
    const { getDb } = await import("../../src/db.js");
    const db = getDb();
    const { data: tasks } = await db
      .from("ops_tasks")
      .select("id, directive_id")
      .eq("directive_id", createdDirectiveId!);

    expect(tasks).toBeTruthy();
    expect(tasks!.length).toBeGreaterThanOrEqual(1);
  });

  // ── Caso 5: Aplicar de nuevo → idempotente ──
  it("apply is idempotent on already-applied directive", async () => {
    expect(createdDirectiveId).toBeTruthy();

    const res = await app.inject({
      method: "POST",
      url: `/ops/directives/${createdDirectiveId}/apply`,
    });

    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.tasks_created).toBe(0);
    expect(body.data.idempotent).toBe(true);
  });
});
