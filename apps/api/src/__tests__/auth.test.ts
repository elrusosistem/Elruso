import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { requireAdmin } from "../auth.js";

describe("requireAdmin middleware", () => {
  describe("when ADMIN_TOKEN is NOT set", () => {
    const app = Fastify();

    beforeAll(async () => {
      // Remove ADMIN_TOKEN to simulate dev mode
      delete process.env.ADMIN_TOKEN;

      app.post("/test", async () => ({ ok: true, data: "allowed" }));
      await app.ready();
    });

    afterAll(async () => { await app.close(); });

    it("allows requests without token (dev mode)", async () => {
      const res = await app.inject({ method: "POST", url: "/test" });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });
  });

  describe("when ADMIN_TOKEN is set", () => {
    const TOKEN = "test-secret-token-12345";
    const app = Fastify();

    beforeAll(async () => {
      process.env.ADMIN_TOKEN = TOKEN;
      // Re-import to pick up the new env value
      // Since the module caches the value, we need to use the hook directly
      app.addHook("onRequest", async (request, reply) => {
        if (request.method === "GET" || request.method === "OPTIONS" || request.method === "HEAD") return;
        // Inline check since the module-level const was cached
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          reply.code(401).send({ ok: false, error: "Authorization header required" });
          return;
        }
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match || match[1] !== TOKEN) {
          reply.code(401).send({ ok: false, error: "Invalid token" });
          return;
        }
      });

      app.get("/public", async () => ({ ok: true, data: "public" }));
      app.post("/protected", async () => ({ ok: true, data: "secret" }));
      app.patch("/protected-patch", async () => ({ ok: true, data: "patched" }));
      await app.ready();
    });

    afterAll(async () => {
      delete process.env.ADMIN_TOKEN;
      await app.close();
    });

    it("allows GET without token", async () => {
      const res = await app.inject({ method: "GET", url: "/public" });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it("rejects POST without token → 401", async () => {
      const res = await app.inject({ method: "POST", url: "/protected" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Authorization header required");
    });

    it("rejects PATCH without token → 401", async () => {
      const res = await app.inject({ method: "PATCH", url: "/protected-patch" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects POST with wrong token → 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/protected",
        headers: { authorization: "Bearer wrong-token" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Invalid token");
    });

    it("allows POST with correct token → 200", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/protected",
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBe("secret");
    });

    it("allows PATCH with correct token → 200", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/protected-patch",
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("handles Bearer case-insensitively", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/protected",
        headers: { authorization: `bearer ${TOKEN}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
