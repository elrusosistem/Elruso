import Fastify from "fastify";
import cors from "@fastify/cors";
import { runsRoutes } from "../../routes/runs.js";
import { opsRoutes } from "../../routes/ops.js";
import { gptRoutes } from "../../routes/gpt.js";
import { decisionsRoutes } from "../../routes/decisions.js";
import { objectivesRoutes } from "../../routes/objectives.js";
import { wizardRoutes } from "../../routes/wizard.js";
import { projectsRoutes } from "../../routes/projects.js";

export async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // No auth hook — tests run in dev mode (no ADMIN_TOKEN)

  await app.register(runsRoutes);
  await app.register(opsRoutes);
  await app.register(gptRoutes);
  await app.register(decisionsRoutes);
  await app.register(objectivesRoutes);
  await app.register(wizardRoutes);
  await app.register(projectsRoutes);

  await app.ready();
  return app;
}
