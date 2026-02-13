#!/usr/bin/env bash
set -euo pipefail

# ─── compose_gpt_prompt.sh ────────────────────────────────────────────
# Genera un "paquete de contexto" listo para pegar en GPT.
# Lee datos dinamicos (tasks, requests, directives, ultimo run) de la API.
# Docs estaticos se leen de archivos.
#
# Uso: ./scripts/compose_gpt_prompt.sh
# Output: reports/gpt/prompts/<timestamp>.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="$ROOT/reports/gpt/prompts/${TIMESTAMP}.md"
MAX_CHARS=12000

API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"

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

# ─── Leer archivos ops (docs estaticos) ──────────────────────────────
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
DECISIONS=$(read_file_safe "$ROOT/ops/DECISIONS.md")

# ─── Leer datos dinamicos de API (fallback a archivos) ───────────────
fetch_api() {
  local endpoint="$1"
  local jq_filter="${2:-.}"
  curl -sf "${API_BASE_URL}${endpoint}" 2>/dev/null | jq -r "$jq_filter" 2>/dev/null || echo ""
}

# Tasks
TASKS=$(fetch_api "/ops/tasks" '.data')
if [ -z "$TASKS" ] || [ "$TASKS" = "null" ]; then
  echo "[compose_gpt_prompt] WARN: API no responde, leyendo TASKS.json de archivo"
  TASKS=$(read_file_safe "$ROOT/ops/TASKS.json")
fi

# Requests
REQUESTS=$(fetch_api "/ops/requests" '.data')
if [ -z "$REQUESTS" ] || [ "$REQUESTS" = "null" ]; then
  echo "[compose_gpt_prompt] WARN: API no responde, leyendo REQUESTS.json de archivo"
  REQUESTS=$(read_file_safe "$ROOT/ops/REQUESTS.json")
fi

# Directives inbox
INBOX=$(fetch_api "/ops/directives" '.data')
if [ -z "$INBOX" ] || [ "$INBOX" = "null" ]; then
  echo "[compose_gpt_prompt] WARN: API no responde, leyendo DIRECTIVES_INBOX.json de archivo"
  INBOX=$(read_file_safe "$ROOT/ops/DIRECTIVES_INBOX.json")
fi

# ─── Estado git ───────────────────────────────────────────────────────
GIT_HEAD="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
GIT_BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null || echo 'detached')"
GIT_LOG="$(git -C "$ROOT" log --oneline -5 2>/dev/null || echo '(sin historia)')"

# ─── Ultimo run (de API) ─────────────────────────────────────────────
LAST_RUN=$(fetch_api "/runs" '.data[0] | "Task: \(.task_id), Status: \(.status), Branch: \(.branch), Summary: \(.summary)"')
if [ -z "$LAST_RUN" ] || [ "$LAST_RUN" = "null" ]; then
  # Fallback: ultimo archivo de report
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

Sos el orquestador estrategico del sistema "El Ruso". Tu rol es analizar el estado actual del proyecto y generar **directivas estructuradas** para que Claude Code las implemente.

## TU OUTPUT REQUERIDO

Responde SOLO con un JSON array de directivas. Cada directiva debe seguir este formato exacto:

\`\`\`json
[
  {
    "id": "DIR-XXX",
    "source": "gpt",
    "title": "Titulo corto (max 120 chars)",
    "body": "Descripcion completa en markdown. Que hacer, como, y por que.",
    "acceptance_criteria": [
      "Criterio verificable 1",
      "Criterio verificable 2"
    ],
    "tasks_to_create": [
      {
        "title": "Titulo de task",
        "phase": 1,
        "depends_on": ["T-XXX"],
        "blocked_by": ["REQ-XXX"]
      }
    ]
  }
]
\`\`\`

## REGLAS PARA GENERAR DIRECTIVAS

1. Solo directivas accionables. No filosofia.
2. Cada directiva debe tener acceptance_criteria verificables por CLI.
3. No pedir cosas que esten bloqueadas por REQUESTS sin resolver.
4. Respetar el stack fijo (no proponer cambios de tecnologia).
5. Priorizar: lo que desbloquea mas tareas primero.
6. GPT define, Claude ejecuta, Humano aprueba.
7. Idioma: espanol en toda comunicacion.

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
- Ultimos commits:
\`\`\`
${GIT_LOG}
\`\`\`
- Ultimo run: ${LAST_RUN}
- Fecha: $(date -u +%Y-%m-%dT%H:%M:%SZ)

---

Analiza el estado y genera directivas. Prioriza lo que mas avanza el proyecto.
PROMPT_END
)

# ─── Verificar tamano ────────────────────────────────────────────────
CHAR_COUNT=${#PROMPT}
if [ "$CHAR_COUNT" -gt "$MAX_CHARS" ]; then
  echo "[compose_gpt_prompt] WARN: Prompt excede ${MAX_CHARS} chars (${CHAR_COUNT}). Truncando secciones largas..."

  # Re-componer con ARCH truncada
  ARCH_SHORT=$(truncate_to "$ARCH" 1500)
  DECISIONS_SHORT=$(truncate_to "$DECISIONS" 1000)

  PROMPT=$(echo "$PROMPT" | sed "/## ARQUITECTURA/,/## DIRECTIVAS VIGENTES/{
    /## ARQUITECTURA/!{/## DIRECTIVAS VIGENTES/!d;}
  }")
fi

mkdir -p "$(dirname "$OUTPUT")"
echo "$PROMPT" > "$OUTPUT"

FINAL_COUNT=${#PROMPT}
echo "[compose_gpt_prompt] Prompt generado: $OUTPUT"
echo "[compose_gpt_prompt] Tamano: ${FINAL_COUNT} chars"
echo ""
echo "Siguiente paso: pegar contenido de $OUTPUT en GPT."
echo "GPT responde con JSON de directivas."
echo "Guardar respuesta en: reports/gpt/directives/incoming.json"
echo "Luego ejecutar: ./scripts/apply_gpt_directives.sh reports/gpt/directives/incoming.json"
