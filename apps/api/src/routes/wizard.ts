import type { FastifyInstance } from "fastify";
import type { ApiResponse, WizardState } from "@elruso/types";
import { getDb } from "../db.js";
import { ensurePlanningRequests } from "../profiles/index.js";
import { getProjectIdOrDefault, requireProjectId } from "../projectScope.js";

function logDecision(opts: {
  source: string;
  decision_key: string;
  decision_value: Record<string, unknown>;
  project_id: string;
}): void {
  const db = getDb();
  db.from("decisions_log")
    .insert({
      source: opts.source,
      decision_key: opts.decision_key,
      decision_value: opts.decision_value,
      context: null,
      project_id: opts.project_id,
    })
    .then(
      () => {},
      () => {},
    );
}

const DEFAULT_WIZARD: WizardState = {
  has_completed_wizard: false,
  answers: {},
  current_profile: "open",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function wizardRoutes(app: FastifyInstance): Promise<void> {
  // GET /ops/wizard/status
  app.get(
    "/ops/wizard/status",
    async (request): Promise<ApiResponse<WizardState>> => {
      const projectId = getProjectIdOrDefault(request);
      const db = getDb();
      const { data, error } = await db
        .from("wizard_state")
        .select("*")
        .eq("project_id", projectId)
        .single();

      if (error || !data) {
        return { ok: true, data: DEFAULT_WIZARD };
      }

      return {
        ok: true,
        data: {
          has_completed_wizard: data.has_completed_wizard,
          answers: data.answers ?? {},
          current_profile: data.current_profile ?? "open",
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
      reply,
    ): Promise<
      ApiResponse<{
        wizard: WizardState;
        requests_created?: string[];
        requests_skipped?: string[];
      }>
    > => {
      const projectId = requireProjectId(request, reply);
      if (!projectId) return { ok: false, error: "X-Project-Id required" };

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

      // Profile comes from the project, NOT from wizard answers
      const { data: projectData } = await db
        .from("projects")
        .select("profile")
        .eq("id", projectId)
        .single();
      const profile = projectData?.profile ?? "open";

      const row = {
        project_id: projectId,
        has_completed_wizard: completed,
        answers: body.answers,
        current_profile: profile,
        updated_at: now,
      };

      const { error: upsertError } = await db
        .from("wizard_state")
        .upsert(row, { onConflict: "project_id" });

      if (upsertError) {
        return {
          ok: false,
          error: `Error guardando wizard: ${upsertError.message}`,
        };
      }

      let requestsCreated: string[] = [];
      let requestsSkipped: string[] = [];

      if (completed) {
        const result = await ensurePlanningRequests(db, profile, undefined, projectId);
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
          project_id: projectId,
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
            project_id: projectId,
          });
        }
      }

      // Re-read the row
      const { data } = await db
        .from("wizard_state")
        .select("*")
        .eq("project_id", projectId)
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
