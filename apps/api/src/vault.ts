import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { DEFAULT_PROJECT_ID } from "./projectScope.js";

const BASE_SECRETS_DIR = resolve(import.meta.dirname, "../../../ops/.secrets");
const ROOT_DIR = resolve(import.meta.dirname, "../../..");

function secretsDir(projectId?: string): string {
  const pid = projectId ?? DEFAULT_PROJECT_ID;
  return resolve(BASE_SECRETS_DIR, pid);
}

function vaultFile(projectId?: string): string {
  return resolve(secretsDir(projectId), "requests_values.json");
}

function ensureDir(projectId?: string): void {
  const dir = secretsDir(projectId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readVault(projectId?: string): Record<string, Record<string, string>> {
  ensureDir(projectId);
  const file = vaultFile(projectId);
  if (!existsSync(file)) return {};
  const content = readFileSync(file, "utf-8");
  return JSON.parse(content);
}

function writeVault(data: Record<string, Record<string, string>>, projectId?: string): void {
  ensureDir(projectId);
  writeFileSync(vaultFile(projectId), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ─── Backward compat: read legacy vault (flat, no project namespace) ─
function readLegacyVault(): Record<string, Record<string, string>> {
  const legacyFile = resolve(BASE_SECRETS_DIR, "requests_values.json");
  if (!existsSync(legacyFile)) return {};
  const content = readFileSync(legacyFile, "utf-8");
  return JSON.parse(content);
}

function readVaultWithFallback(projectId?: string): Record<string, Record<string, string>> {
  const vault = readVault(projectId);
  if (Object.keys(vault).length > 0) return vault;
  // Fallback to legacy vault for backward compat
  return readLegacyVault();
}

export function saveRequestValues(requestId: string, values: Record<string, string>, projectId?: string): void {
  const vault = readVault(projectId);
  vault[requestId] = values;
  writeVault(vault, projectId);
}

export function hasRequestValues(requestId: string, projectId?: string): boolean {
  const vault = readVaultWithFallback(projectId);
  return requestId in vault && Object.keys(vault[requestId]).length > 0;
}

export function getRequestValues(requestId: string, projectId?: string): Record<string, string> | null {
  const vault = readVaultWithFallback(projectId);
  return vault[requestId] ?? null;
}

export function getAllValues(projectId?: string): Record<string, string> {
  const vault = readVaultWithFallback(projectId);
  const flat: Record<string, string> = {};
  for (const values of Object.values(vault)) {
    Object.assign(flat, values);
  }
  return flat;
}

export function generateEnvRuntime(projectId?: string): string {
  const values = getAllValues(projectId);
  const lines = Object.entries(values)
    .map(([key, val]) => `${key}=${val}`)
    .join("\n");
  const envPath = resolve(ROOT_DIR, ".env.runtime");
  writeFileSync(envPath, lines + "\n", "utf-8");
  return envPath;
}

// ─── Redact: nunca exponer valores completos ────────────────────────
// Delegamos a redact.ts centralizado para patrones + vault values

import { redactValue, redact as redactFull } from "./redact.js";

const redact = redactValue;
export { redact };

export function redactOutput(output: string, projectId?: string): string {
  return redactFull(output, getAllValues(projectId));
}

// ─── Validación por provider ────────────────────────────────────────

export async function validateProvider(requestId: string, projectId?: string): Promise<{ ok: boolean; message: string }> {
  const values = getRequestValues(requestId, projectId);
  if (!values || Object.keys(values).length === 0) {
    return { ok: false, message: "No hay valores guardados en vault para este request" };
  }

  switch (requestId) {
    case "REQ-001": return validateSupabase(values);
    case "REQ-002": return validateRender(values);
    case "REQ-003": return validateVercel(values);
    case "REQ-005": return validateDatabase(values, projectId);
    case "REQ-TN-STORE": return validateTiendanubeStore(values);
    case "REQ-TN-TOKEN": return validateTiendanubeToken(values, projectId);
    default: return { ok: true, message: "Request sin validación automática" };
  }
}

async function validateSupabase(values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const url = values.SUPABASE_URL;
  const key = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return { ok: false, message: "SUPABASE_URL no proporcionada" };
  if (!key) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY no proporcionada" };

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.ok || res.status === 200) {
      return { ok: true, message: `Supabase OK (${redact(url)})` };
    }
    return { ok: false, message: `Supabase respondió ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando a Supabase: ${(e as Error).message}` };
  }
}

async function validateRender(values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const token = values.RENDER_API_TOKEN;
  if (!token) return { ok: false, message: "RENDER_API_TOKEN no proporcionado" };

  try {
    const res = await fetch("https://api.render.com/v1/owners", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as Array<{ owner: { name: string } }>;
      const name = data[0]?.owner?.name ?? "unknown";
      return { ok: true, message: `Render OK (owner: ${name})` };
    }
    return { ok: false, message: `Render respondió ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando a Render: ${(e as Error).message}` };
  }
}

async function validateVercel(values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const token = values.VERCEL_TOKEN;
  if (!token) return { ok: false, message: "VERCEL_TOKEN no proporcionado" };

  try {
    const res = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as { user: { username: string } };
      return { ok: true, message: `Vercel OK (user: ${data.user?.username ?? "unknown"})` };
    }
    return { ok: false, message: `Vercel respondió ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando a Vercel: ${(e as Error).message}` };
  }
}

async function validateDatabase(_values: Record<string, string>, projectId?: string): Promise<{ ok: boolean; message: string }> {
  const dbUrl = _values.DATABASE_URL;
  if (!dbUrl) return { ok: false, message: "DATABASE_URL no proporcionada" };

  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    return { ok: false, message: "DATABASE_URL debe comenzar con postgresql:// o postgres://" };
  }

  const vault = readVaultWithFallback(projectId);
  const supaValues = vault["REQ-001"];
  if (!supaValues?.SUPABASE_URL || !supaValues?.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Necesitás guardar REQ-001 (Supabase creds) primero para validar la DB" };
  }

  try {
    const res = await fetch(`${supaValues.SUPABASE_URL}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        apikey: supaValues.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${supaValues.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    if (res.status < 500) {
      return { ok: true, message: `Database OK (formato válido, Supabase API conectada)` };
    }
    return { ok: false, message: `Database error: Supabase API respondió ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando: ${(e as Error).message}` };
  }
}

async function validateTiendanubeStore(values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const storeId = values.TIENDANUBE_STORE_ID;
  const storeUrl = values.TIENDANUBE_STORE_URL;

  if (!storeId) return { ok: false, message: "TIENDANUBE_STORE_ID no proporcionado" };
  if (!/^\d+$/.test(storeId)) return { ok: false, message: "TIENDANUBE_STORE_ID debe ser numerico" };

  if (storeUrl) {
    const urlPattern = /^https?:\/\/.+\.(mitiendanube\.com|lojavirtualnuvem\.com\.br)(\/.*)?$/i;
    if (!urlPattern.test(storeUrl)) {
      return { ok: false, message: "TIENDANUBE_STORE_URL debe ser *.mitiendanube.com o *.lojavirtualnuvem.com.br" };
    }
  }

  return { ok: true, message: `Tiendanube Store OK (ID: ${storeId})` };
}

async function validateTiendanubeToken(values: Record<string, string>, projectId?: string): Promise<{ ok: boolean; message: string }> {
  const token = values.TIENDANUBE_ACCESS_TOKEN;
  if (!token) return { ok: false, message: "TIENDANUBE_ACCESS_TOKEN no proporcionado" };

  const storeValues = getRequestValues("REQ-TN-STORE", projectId);
  const storeId = storeValues?.TIENDANUBE_STORE_ID;

  if (!storeId) {
    return { ok: false, message: "Configurar primero REQ-TN-STORE (Store ID) antes de validar el token" };
  }

  try {
    const res = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
      headers: { Authentication: `bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json() as { name?: Record<string, string> };
      const name = data.name?.es ?? data.name?.pt ?? Object.values(data.name ?? {})[0] ?? "OK";
      return { ok: true, message: `Tiendanube OK (tienda: ${name})` };
    }

    if (res.status === 401) {
      return { ok: false, message: "Token invalido o expirado" };
    }

    return { ok: false, message: `Tiendanube respondio ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando a Tiendanube: ${(e as Error).message}` };
  }
}

// ─── Ejecutar script con vault env ──────────────────────────────────

export function execScript(scriptName: string, projectId?: string): Promise<{ ok: boolean; output: string; exitCode: number }> {
  const scriptPath = resolve(ROOT_DIR, "scripts", scriptName);
  const env = { ...process.env, ...getAllValues(projectId) };

  return new Promise((resolve) => {
    execFile("bash", [scriptPath], { env, timeout: 120000, cwd: ROOT_DIR }, (error, stdout, stderr) => {
      const rawOutput = (stdout || "") + (stderr || "");
      const output = redactOutput(rawOutput, projectId);
      if (error) {
        resolve({ ok: false, output, exitCode: error.code === "ETIMEDOUT" ? -1 : (error as any).status ?? 1 });
      } else {
        resolve({ ok: true, output, exitCode: 0 });
      }
    });
  });
}
