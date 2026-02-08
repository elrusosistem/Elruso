import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SECRETS_DIR = resolve(import.meta.dirname, "../../../../ops/.secrets");
const VAULT_FILE = resolve(SECRETS_DIR, "requests_values.json");

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
  const envPath = resolve(import.meta.dirname, "../../../../.env.runtime");
  writeFileSync(envPath, lines + "\n", "utf-8");
  return envPath;
}
