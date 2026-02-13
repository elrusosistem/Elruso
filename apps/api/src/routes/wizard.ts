import type { FastifyInstance } from "fastify";
import type { ApiResponse, WizardState } from "@elruso/types";
import { getDb } from "../db.js";
import { ensurePlanningRequests } from "../profiles/index.js";

function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
}): void {
  const db = getDb();
  db.from("decisions_log")
    .insert({
      source: opts.source,
      decision_key: opts.decision_key,
      decision_value: opts.decision_value,
      context: null,
    })
    .then(
      () => {},
      () => {},
    );
}

const DEFAULT_WIZARD: WizardState = {
  has_completed_wizard: false,
  answers: {},
  current_profile: "tiendanube",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function wizardRoutes(app: FastifyInstance): Promise<void> {
  // GET /ops/wizard/status
  app.get(
    "/ops/wizard/status",
    async (): Promise<ApiResponse<WizardState>> => {
      const db = getDb();
      const { data, error } = await db
        .from("wizard_state")
        .select("*")
        .eq("id", 1)
        .single();

      if (error || !data) {
        return { ok: true, data: DEFAULT_WIZARD };
      }

      return {
        ok: true,
        data: {
          has_completed_wizard: data.has_completed_wizard,
          answers: data.answers ?? {},
          current_profile: data.current_profile ?? "tiendanube",
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
      };
    },
  );

  // POST /ops/wizard/answers
  app.post(
    "/ops/wizard/answers",
    async (
      request,
    ): Promise<
      ApiResponse<{
        wizard: WizardState;
        requests_created?: string[];
        requests_skipped?: string[];
      }>
    > => {
      const db = getDb();
      const body = request.body as {
        answers?: Record<string, unknown>;
        completed?: boolean;
      };

      if (!body.answers) {
        return { ok: false, error: "answers es requerido" };
      }

      const now = new Date().toISOString();
      const completed = body.completed === true;
      const profile =
        (body.answers.profile as string) ?? "tiendanube";

      const row = {
        id: 1,
        has_completed_wizard: completed,
        answers: body.answers,
        current_profile: profile,
        updated_at: now,
      };

      const { error: upsertError } = await db
        .from("wizard_state")
        .upsert(row, { onConflict: "id" });

      if (upsertError) {
        return {
          ok: false,
          error: `Error guardando wizard: ${upsertError.message}`,
        };
      }

      let requestsCreated: string[] = [];
      let requestsSkipped: string[] = [];

      if (completed) {
        const result = await ensurePlanningRequests(db, profile);
        requestsCreated = result.created;
        requestsSkipped = result.skipped;

        logDecision({
          source: "human",
          decision_key: "wizard_completed",
          decision_value: {
            profile,
            answers_keys: Object.keys(body.answers),
            requests_created: requestsCreated,
          },
        });

        if (requestsCreated.length > 0) {
          logDecision({
            source: "system",
            decision_key: "auto_requests_created",
            decision_value: {
              profile,
              created: requestsCreated,
              skipped: requestsSkipped,
            },
          });
        }
      }

      // Re-read the row
      const { data } = await db
        .from("wizard_state")
        .select("*")
        .eq("id", 1)
        .single();

      return {
        ok: true,
        data: {
          wizard: {
            has_completed_wizard: data?.has_completed_wizard ?? completed,
            answers: data?.answers ?? body.answers,
            current_profile: data?.current_profile ?? profile,
            created_at: data?.created_at ?? now,
            updated_at: data?.updated_at ?? now,
          },
          requests_created: requestsCreated,
          requests_skipped: requestsSkipped,
        },
      };
    },
  );
}
