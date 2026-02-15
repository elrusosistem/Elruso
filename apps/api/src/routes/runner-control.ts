import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@elruso/types";
import { getRequestValues } from "../vault.js";

// GCP Compute Engine API — control de la VM del runner
// Requiere REQ-GCP-SA con GOOGLE_SERVICE_ACCOUNT_JSON, GCP_PROJECT_ID, GCP_ZONE, GCP_INSTANCE

interface GcpConfig {
  credentials: { client_email: string; private_key: string };
  projectId: string;
  zone: string;
  instance: string;
}

async function getGcpConfig(): Promise<GcpConfig | null> {
  // Try vault first, then env vars (Render loses vault on redeploy)
  const vals = getRequestValues("REQ-GCP-VM");
  const saJson = vals?.GCP_SERVICE_ACCOUNT_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
  const projectId = vals?.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID;
  const zone = vals?.GCP_ZONE || process.env.GCP_ZONE;
  const instance = vals?.GCP_INSTANCE || process.env.GCP_INSTANCE;

  if (!saJson || !projectId || !zone || !instance) return null;

  try {
    const credentials = JSON.parse(saJson);
    return { credentials, projectId, zone, instance };
  } catch {
    return null;
  }
}

// Create a JWT and exchange it for an access token (no external lib needed)
async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/compute",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const { createSign } = await import("node:crypto");

  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCP auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function gcpComputeAction(
  action: "start" | "stop" | "reset",
  config: GcpConfig,
): Promise<{ ok: boolean; message: string }> {
  const token = await getAccessToken(config.credentials);
  const url = `https://compute.googleapis.com/compute/v1/projects/${config.projectId}/zones/${config.zone}/instances/${config.instance}/${action}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: `GCP ${action} failed (${res.status}): ${text}` };
  }

  return { ok: true, message: `VM ${action} enviado OK` };
}

async function gcpGetStatus(config: GcpConfig): Promise<{ ok: boolean; status?: string; message?: string }> {
  const token = await getAccessToken(config.credentials);
  const url = `https://compute.googleapis.com/compute/v1/projects/${config.projectId}/zones/${config.zone}/instances/${config.instance}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: `GCP status failed (${res.status}): ${text}` };
  }

  const data = (await res.json()) as { status: string };
  return { ok: true, status: data.status };
}

export async function runnerControlRoutes(app: FastifyInstance): Promise<void> {
  // GET /ops/runner/vm — Get VM status from GCP
  app.get("/ops/runner/vm", async (): Promise<ApiResponse<{ vm_status: string; configured: boolean }>> => {
    const config = await getGcpConfig();
    if (!config) {
      return { ok: true, data: { vm_status: "unknown", configured: false } };
    }

    try {
      const result = await gcpGetStatus(config);
      if (!result.ok) return { ok: false, error: result.message };
      return { ok: true, data: { vm_status: result.status!.toLowerCase(), configured: true } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  // POST /ops/runner/vm/:action — Start, stop, or reset the VM
  app.post<{ Params: { action: string } }>(
    "/ops/runner/vm/:action",
    async (request): Promise<ApiResponse<{ message: string }>> => {
      const { action } = request.params;

      if (!["start", "stop", "reset"].includes(action)) {
        return { ok: false, error: `Accion invalida: ${action}. Validas: start, stop, reset` };
      }

      const config = await getGcpConfig();
      if (!config) {
        return { ok: false, error: "GCP no configurado. Carga las credenciales en Configuracion (REQ-GCP-VM)." };
      }

      try {
        const result = await gcpComputeAction(action as "start" | "stop" | "reset", config);
        if (!result.ok) return { ok: false, error: result.message };
        return { ok: true, data: { message: result.message } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  );
}
