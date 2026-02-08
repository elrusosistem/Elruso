#!/usr/bin/env bash
set -euo pipefail

# ─── compose_gpt_prompt.sh ────────────────────────────────────────────
# Genera un "paquete de contexto" listo para pegar en GPT.
# GPT devuelve directivas estructuradas que luego se aplican con apply_gpt_directives.sh
#
# Uso: ./scripts/compose_gpt_prompt.sh
# Output: reports/gpt/prompts/<timestamp>.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="$ROOT/reports/gpt/prompts/${TIMESTAMP}.md"
MAX_CHARS=12000

# ─── Helper: truncar a N chars ───────────────────────────────────────
truncate_to() {
  local content="$1"
  local max="$2"
  if [ "${#content}" -gt "$max" ]; then
    echo "${content:0:$max}..."
    echo ""
    echo "(truncado a ${max} chars)"
  else
    echo "$content"
  fi
}

# ─── Leer archivos ops ───────────────────────────────────────────────
read_file_safe() {
  if [ -f "$1" ]; then
    cat "$1"
  else
    echo "(archivo no encontrado: $1)"
  fi
}

STACK=$(read_file_safe "$ROOT/ops/STACK.md")
ARCH=$(read_file_safe "$ROOT/ops/ARCH.md")
DIRECTIVES=$(read_file_safe "$ROOT/ops/DIRECTIVES.md")
TASKS=$(read_file_safe "$ROOT/ops/TASKS.json")
REQUESTS=$(read_file_safe "$ROOT/ops/REQUESTS.json")
INBOX=$(read_file_safe "$ROOT/ops/DIRECTIVES_INBOX.json")
DECISIONS=$(read_file_safe "$ROOT/ops/DECISIONS.md")

# ─── Estado git ───────────────────────────────────────────────────────
GIT_HEAD="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
GIT_BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null || echo 'detached')"
GIT_LOG="$(git -C "$ROOT" log --oneline -5 2>/dev/null || echo '(sin historia)')"

# ─── Último run ───────────────────────────────────────────────────────
LAST_RUN=""
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  LAST_RUN=$(psql "$DATABASE_URL" -t -A -F'|' -c "
    SELECT task_id, status, branch, commit_hash, summary, started_at
    FROM run_logs ORDER BY started_at DESC LIMIT 1;
  " 2>/dev/null || echo "")
fi
if [ -z "$LAST_RUN" ]; then
  # Fallback: último archivo de report
  LATEST_REPORT=$(ls -t "$ROOT"/reports/runs/*.md 2>/dev/null | head -1 || echo "")
  if [ -n "$LATEST_REPORT" ]; then
    LAST_RUN="(desde archivo: $(basename "$LATEST_REPORT"))"
  else
    LAST_RUN="(sin runs previos)"
  fi
fi

# ─── Componer prompt ──────────────────────────────────────────────────
PROMPT=$(cat <<PROMPT_END
# CONTEXTO PARA GPT — El Ruso (Orquestador)

Sos el orquestador estratégico del sistema "El Ruso". Tu rol es analizar el estado actual del proyecto y generar **directivas estructuradas** para que Claude Code las implemente.

## TU OUTPUT REQUERIDO

Responde SOLO con un JSON array de directivas. Cada directiva debe seguir este formato exacto:

\`\`\`json
[
  {
    "id": "DIR-XXX",
    "source": "gpt",
    "title": "Título corto (max 120 chars)",
    "body": "Descripción completa en markdown. Qué hacer, cómo, y por qué.",
    "acceptance_criteria": [
      "Criterio verificable 1",
      "Criterio verificable 2"
    ],
    "tasks_to_create": [
      {
        "title": "Título de task",
        "phase": 1,
        "depends_on": ["T-XXX"],
        "blocked_by": ["REQ-XXX"]
      }
    ]
  }
]
\`\`\`

## REGLAS PARA GENERAR DIRECTIVAS

1. Solo directivas accionables. No filosofía.
2. Cada directiva debe tener acceptance_criteria verificables por CLI.
3. No pedir cosas que estén bloqueadas por REQUESTS sin resolver.
4. Respetar el stack fijo (no proponer cambios de tecnología).
5. Priorizar: lo que desbloquea más tareas primero.
6. No tocar precios, solo stock.
7. Source of truth de stock: nuestro sistema.

---

## STACK
${STACK}

## ARQUITECTURA
${ARCH}

## DIRECTIVAS VIGENTES
${DIRECTIVES}

## DECISIONES TOMADAS
${DECISIONS}

## TASKS (backlog)
\`\`\`json
${TASKS}
\`\`\`

## REQUESTS PENDIENTES
\`\`\`json
${REQUESTS}
\`\`\`

## DIRECTIVAS INBOX (historial)
\`\`\`json
${INBOX}
\`\`\`

## ESTADO ACTUAL
- Branch: ${GIT_BRANCH}
- HEAD: ${GIT_HEAD}
- Últimos commits:
\`\`\`
${GIT_LOG}
\`\`\`
- Último run: ${LAST_RUN}
- Fecha: $(date -u +%Y-%m-%dT%H:%M:%SZ)

---

Analizá el estado y generá directivas. Priorizá lo que más avanza el proyecto.
PROMPT_END
)

# ─── Verificar tamaño ────────────────────────────────────────────────
CHAR_COUNT=${#PROMPT}
if [ "$CHAR_COUNT" -gt "$MAX_CHARS" ]; then
  echo "[compose_gpt_prompt] WARN: Prompt excede ${MAX_CHARS} chars (${CHAR_COUNT}). Truncando secciones largas..."

  # Re-componer con ARCH truncada
  ARCH_SHORT=$(truncate_to "$ARCH" 1500)
  DECISIONS_SHORT=$(truncate_to "$DECISIONS" 1000)

  PROMPT=$(echo "$PROMPT" | sed "/## ARQUITECTURA/,/## DIRECTIVAS VIGENTES/{
    /## ARQUITECTURA/!{/## DIRECTIVAS VIGENTES/!d;}
  }")
  # Simplificar: guardar tal cual, el usuario puede recortar manualmente
fi

echo "$PROMPT" > "$OUTPUT"

FINAL_COUNT=${#PROMPT}
echo "[compose_gpt_prompt] Prompt generado: $OUTPUT"
echo "[compose_gpt_prompt] Tamaño: ${FINAL_COUNT} chars"
echo ""
echo "Siguiente paso: pegar contenido de $OUTPUT en GPT."
echo "GPT responde con JSON de directivas."
echo "Guardar respuesta en: reports/gpt/directives/incoming.json"
echo "Luego ejecutar: ./scripts/apply_gpt_directives.sh reports/gpt/directives/incoming.json"
