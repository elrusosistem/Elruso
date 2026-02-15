import type { FastifyRequest, FastifyReply } from "fastify";

export const DEFAULT_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read X-Project-Id header and validate UUID format. Returns null if missing/invalid. */
export function getProjectId(request: FastifyRequest): string | null {
  const header = request.headers["x-project-id"] as string | undefined;
  if (!header) return null;
  if (!UUID_RE.test(header)) return null;
  return header;
}

/** Require X-Project-Id header. Returns project_id or sends 400 and returns null. */
export function requireProjectId(request: FastifyRequest, reply: FastifyReply): string | null {
  const projectId = getProjectId(request);
  if (!projectId) {
    reply.code(400).send({ ok: false, error: "X-Project-Id header required (valid UUID)" });
    return null;
  }
  return projectId;
}

/** Read X-Project-Id or fall back to DEFAULT_PROJECT_ID. */
export function getProjectIdOrDefault(request: FastifyRequest): string {
  return getProjectId(request) ?? DEFAULT_PROJECT_ID;
}
