import { describe, it, expect, afterAll } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";

function buildApp() {
  const app = Fastify();
  app.register(cors, { origin: true });

  app.get("/health", async () => {
    return { ok: true, data: { status: "healthy" } };
  });

  return app;
}

describe("GET /health", () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  it("returns healthy status", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("healthy");
  });
});
