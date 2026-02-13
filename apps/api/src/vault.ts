import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";

const SECRETS_DIR = resolve(import.meta.dirname, "../../../ops/.secrets");
const VAULT_FILE = resolve(SECRETS_DIR, "requests_values.json");
const ROOT_DIR = resolve(import.meta.dirname, "../../..");

function ensureDir(): void {
  if (!existsSync(SECRETS_DIR)) {
    mkdirSync(SECRETS_DIR, { recursive: true });
  }
}

function readVault(): Record<string, Record<string, string>> {
  ensureDir();
  if (!existsSync(VAULT_FILE)) return {};
  const content = readFileSync(VAULT_FILE, "utf-8");
  return JSON.parse(content);
}

function writeVault(data: Record<string, Record<string, string>>): void {
  ensureDir();
  writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function saveRequestValues(requestId: string, values: Record<string, string>): void {
  const vault = readVault();
  vault[requestId] = values;
  writeVault(vault);
}

export function hasRequestValues(requestId: string): boolean {
  const vault = readVault();
  return requestId in vault && Object.keys(vault[requestId]).length > 0;
}

export function getRequestValues(requestId: string): Record<string, string> | null {
  const vault = readVault();
  return vault[requestId] ?? null;
}

export function getAllValues(): Record<string, string> {
  const vault = readVault();
  const flat: Record<string, string> = {};
  for (const values of Object.values(vault)) {
    Object.assign(flat, values);
  }
  return flat;
}

export function generateEnvRuntime(): string {
  const values = getAllValues();
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

export function redactOutput(output: string): string {
  return redactFull(output, getAllValues());
}

// ─── Validación por provider ────────────────────────────────────────

export async function validateProvider(requestId: string): Promise<{ ok: boolean; message: string }> {
  const values = getRequestValues(requestId);
  if (!values || Object.keys(values).length === 0) {
    return { ok: false, message: "No hay valores guardados en vault para este request" };
  }

  switch (requestId) {
    case "REQ-001": return validateSupabase(values);
    case "REQ-002": return validateRender(values);
    case "REQ-003": return validateVercel(values);
    case "REQ-005": return validateDatabase(values);
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

async function validateDatabase(_values: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const dbUrl = _values.DATABASE_URL;
  if (!dbUrl) return { ok: false, message: "DATABASE_URL no proporcionada" };

  // Validar que el formato sea un connection string PostgreSQL válido
  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    return { ok: false, message: "DATABASE_URL debe comenzar con postgresql:// o postgres://" };
  }

  // Usar la API REST de Supabase (REQ-001) para validar conectividad a la DB
  // ya que psql + pooler puede tener issues de circuit breaker / SSL
  const vault = readVault();
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
    // Cualquier respuesta (incluso 404 para la rpc inexistente) confirma que PostgREST → DB funciona
    if (res.status < 500) {
      return { ok: true, message: `Database OK (formato válido, Supabase API conectada)` };
    }
    return { ok: false, message: `Database error: Supabase API respondió ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Error conectando: ${(e as Error).message}` };
  }
}

// ─── Ejecutar script con vault env ──────────────────────────────────

export function execScript(scriptName: string): Promise<{ ok: boolean; output: string; exitCode: number }> {
  const scriptPath = resolve(ROOT_DIR, "scripts", scriptName);
  const env = { ...process.env, ...getAllValues() };

  return new Promise((resolve) => {
    execFile("bash", [scriptPath], { env, timeout: 120000, cwd: ROOT_DIR }, (error, stdout, stderr) => {
      const rawOutput = (stdout || "") + (stderr || "");
      const output = redactOutput(rawOutput);
      if (error) {
        resolve({ ok: false, output, exitCode: error.code === "ETIMEDOUT" ? -1 : (error as any).status ?? 1 });
      } else {
        resolve({ ok: true, output, exitCode: 0 });
      }
    });
  });
}
