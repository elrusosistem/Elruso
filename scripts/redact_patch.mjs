#!/usr/bin/env node
// redact_patch.mjs — Redactor standalone para el runner.
// Mismos patterns que apps/api/src/redact.ts (mantener sincronizados).
// Uso: node scripts/redact_patch.mjs < raw.patch > redacted.patch
// Exit 0: OK. Exit 1: fallo o secretos detectados post-redaccion.

import { readFileSync } from "node:fs";

// ─── Patterns (DEBEN coincidir con redact.ts) ───────────────────────
const PATTERN_REPLACEMENTS = [
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: "sk-***REDACTED***" },
  { pattern: /\brnd_[A-Za-z0-9_-]{20,}/g, replacement: "rnd_***REDACTED***" },
  { pattern: /\brndr_[A-Za-z0-9_-]{20,}/g, replacement: "rndr_***REDACTED***" },
  { pattern: /\bvcp_[A-Za-z0-9_-]{20,}/g, replacement: "vcp_***REDACTED***" },
  { pattern: /\bsbp_[A-Za-z0-9_-]{20,}/g, replacement: "sbp_***REDACTED***" },
  { pattern: /\beyJ[A-Za-z0-9_.-]{40,}/g, replacement: "***JWT_REDACTED***" },
  { pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: "Authorization: Bearer ***REDACTED***" },
  { pattern: /apikey:\s*\S+/gi, replacement: "apikey: ***REDACTED***" },
  { pattern: /api_key[=:]\s*\S+/gi, replacement: "api_key=***REDACTED***" },
  { pattern: /token[=:]\s*\S+/gi, replacement: "token=***REDACTED***" },
  { pattern: /([?&])(token|key|secret|api_key|apikey|access_token)=[^&\s]+/gi, replacement: "$1$2=***REDACTED***" },
  { pattern: /postgresql?:\/\/[^:]+:[^@]+@/gi, replacement: "postgresql://***:***@" },
  { pattern: /postgres:\/\/[^:]+:[^@]+@/gi, replacement: "postgres://***:***@" },
];

// Patterns para deteccion post-redaccion (excluyen formas ya redactadas)
const SECRET_PATTERNS = [
  /\bsk-(?!\*)[A-Za-z0-9_-]{20,}/g,
  /\brnd_(?!\*)[A-Za-z0-9_-]{20,}/g,
  /\brndr_(?!\*)[A-Za-z0-9_-]{20,}/g,
  /\bvcp_(?!\*)[A-Za-z0-9_-]{20,}/g,
  /\bsbp_(?!\*)[A-Za-z0-9_-]{20,}/g,
  /\beyJ[A-Za-z0-9_.-]{40,}/g,
  /Authorization:\s*Bearer\s+(?!\*)\S+/gi,
  /postgresql?:\/\/(?!\*)[^:]+:(?!\*)[^@]+@/gi,
  /postgres:\/\/(?!\*)[^:]+:(?!\*)[^@]+@/gi,
];

function redactPatterns(text) {
  let result = text;
  for (const { pattern, replacement } of PATTERN_REPLACEMENTS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

function containsSecrets(text) {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────
const input = readFileSync("/dev/stdin", "utf-8");

if (!input.trim()) {
  // Empty input = no patch. Output empty, exit 0.
  process.stdout.write("");
  process.exit(0);
}

const redacted = redactPatterns(input);

// Safety check: fail if secrets remain
if (containsSecrets(redacted)) {
  process.stderr.write("ERROR: redact_patch.mjs — secrets detected after redaction\n");
  process.exit(1);
}

process.stdout.write(redacted);
