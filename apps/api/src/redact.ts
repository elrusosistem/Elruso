// ─── redact.ts — Redacción centralizada de secretos ─────────────────
// Patrones conocidos de tokens/keys + reemplazo de valores del vault.
// Usar SIEMPRE antes de persistir logs, diffs, patches, summaries.

// Patrones que indican secretos en texto libre
const SECRET_PATTERNS: RegExp[] = [
  // API keys con prefijo conocido
  /\bsk-[A-Za-z0-9_-]{20,}/g,           // OpenAI sk-...
  /\brnd_[A-Za-z0-9_-]{20,}/g,          // Render rnd_...
  /\bsbp_[A-Za-z0-9_-]{20,}/g,          // Supabase sbp_...
  /\beyJ[A-Za-z0-9_-]{40,}/g,           // JWT tokens (eyJ...)
  // Headers con secretos
  /Authorization:\s*Bearer\s+\S+/gi,
  /apikey:\s*\S+/gi,
  /api_key[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
  // URLs con secretos en query string
  /([?&])(token|key|secret|api_key|apikey|access_token)=[^&\s]+/gi,
  // Connection strings con password
  /postgresql?:\/\/[^:]+:[^@]+@/gi,
  /postgres:\/\/[^:]+:[^@]+@/gi,
];

// Reemplazos por patron
const PATTERN_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: "sk-***REDACTED***" },
  { pattern: /\brnd_[A-Za-z0-9_-]{20,}/g, replacement: "rnd_***REDACTED***" },
  { pattern: /\bsbp_[A-Za-z0-9_-]{20,}/g, replacement: "sbp_***REDACTED***" },
  { pattern: /\beyJ[A-Za-z0-9_-]{40,}/g, replacement: "***JWT_REDACTED***" },
  { pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: "Authorization: Bearer ***REDACTED***" },
  { pattern: /apikey:\s*\S+/gi, replacement: "apikey: ***REDACTED***" },
  { pattern: /api_key[=:]\s*\S+/gi, replacement: "api_key=***REDACTED***" },
  { pattern: /token[=:]\s*\S+/gi, replacement: "token=***REDACTED***" },
  { pattern: /([?&])(token|key|secret|api_key|apikey|access_token)=[^&\s]+/gi, replacement: "$1$2=***REDACTED***" },
  { pattern: /postgresql?:\/\/[^:]+:[^@]+@/gi, replacement: "postgresql://***:***@" },
  { pattern: /postgres:\/\/[^:]+:[^@]+@/gi, replacement: "postgres://***:***@" },
];

/**
 * Redacta un valor individual (muestra ultimos 4 chars si es largo).
 */
export function redactValue(value: string): string {
  if (value.length <= 8) return "***";
  return `***${value.slice(-4)}`;
}

/**
 * Redacta secretos conocidos por patron en texto libre.
 * Detecta tokens por prefijo (sk-, rnd_, etc), headers, URLs, connection strings.
 */
export function redactPatterns(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PATTERN_REPLACEMENTS) {
    // Reset lastIndex para regex con /g flag
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Redacta texto reemplazando valores conocidos del vault + patrones.
 * @param text - Texto a redactar
 * @param knownSecrets - Mapa de valores conocidos del vault (key -> value)
 */
export function redact(text: string, knownSecrets?: Record<string, string>): string {
  let result = text;

  // 1. Reemplazar valores conocidos del vault (mas especifico primero)
  if (knownSecrets) {
    // Ordenar por longitud descendente para evitar reemplazos parciales
    const sorted = Object.values(knownSecrets)
      .filter((v) => v.length > 6)
      .sort((a, b) => b.length - a.length);

    for (const secret of sorted) {
      result = result.replaceAll(secret, redactValue(secret));
    }
  }

  // 2. Aplicar patrones genericos
  result = redactPatterns(result);

  return result;
}

/**
 * Verifica si un texto contiene potenciales secretos sin redactar.
 * Util para validacion/tests.
 */
export function containsSecrets(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
