import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ApiResponse } from "@elruso/types";
import { runsRoutes } from "./routes/runs.js";
import { opsRoutes } from "./routes/ops.js";
import { gptRoutes } from "./routes/gpt.js";
import { decisionsRoutes } from "./routes/decisions.js";
import { objectivesRoutes } from "./routes/objectives.js";
import { wizardRoutes } from "./routes/wizard.js";
import { requireAdmin } from "./auth.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// ─── Auth: proteger todas las rutas mutantes (POST/PATCH/PUT/DELETE) ─────
app.addHook("onRequest", async (request, reply) => {
  if (request.method === "GET" || request.method === "OPTIONS" || request.method === "HEAD") return;
  await requireAdmin(request, reply);
});

app.get("/health", async (): Promise<ApiResponse<{ status: string }>> => {
  return { ok: true, data: { status: "healthy" } };
});

app.get("/", async (): Promise<ApiResponse<{ service: string; version: string }>> => {
  return {
    ok: true,
    data: { service: "elruso-api", version: "0.2.0" },
  };
});

// ─── Routes ──────────────────────────────────────────────────────────
await app.register(runsRoutes);
await app.register(opsRoutes);
await app.register(gptRoutes);
await app.register(decisionsRoutes);
await app.register(objectivesRoutes);
await app.register(wizardRoutes);

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`Elruso API running on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
