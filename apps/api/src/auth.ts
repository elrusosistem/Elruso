import type { FastifyRequest, FastifyReply } from "fastify";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/**
 * Fastify onRequest hook: si ADMIN_TOKEN está seteado en env,
 * exige header `Authorization: Bearer <token>`.
 * Si no está seteado, permite todo (modo dev).
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!ADMIN_TOKEN) return; // modo dev: sin token = sin auth

  const authHeader = request.headers.authorization;
  if (!authHeader) {
    reply.code(401).send({ ok: false, error: "Authorization header required" });
    return;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== ADMIN_TOKEN) {
    reply.code(401).send({ ok: false, error: "Invalid token" });
    return;
  }
}
