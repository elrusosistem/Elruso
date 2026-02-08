import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ApiResponse } from "@elruso/types";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async (): Promise<ApiResponse<{ status: string }>> => {
  return { ok: true, data: { status: "healthy" } };
});

app.get("/", async (): Promise<ApiResponse<{ service: string; version: string }>> => {
  return {
    ok: true,
    data: { service: "elruso-api", version: "0.1.0" },
  };
});

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
