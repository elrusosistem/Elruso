#!/usr/bin/env bash
set -euo pipefail

# ─── apply_gpt_directives.sh ──────────────────────────────────────────
# Lee directivas de GPT (JSON) y las transforma en:
# 1. Entradas en /ops/DIRECTIVES_INBOX.json
# 2. Tasks nuevas en /ops/TASKS.json
#
# NO ejecuta nada. Solo transforma directivas en tasks.
#
# Uso: ./scripts/apply_gpt_directives.sh <archivo_directivas.json>
# Ejemplo: ./scripts/apply_gpt_directives.sh reports/gpt/directives/incoming.json

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo_directivas.json>"
  echo "Ejemplo: $0 reports/gpt/directives/incoming.json"
  exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: archivo no encontrado: $INPUT_FILE"
  exit 1
fi

# Verificar jq disponible
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq no encontrado."
  echo "Instalar: brew install jq (macOS) o sudo apt-get install jq (Ubuntu)"
  exit 1
fi

# Validar JSON
if ! jq empty "$INPUT_FILE" 2>/dev/null; then
  echo "Error: el archivo no es JSON válido."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
INBOX_FILE="$ROOT/ops/DIRECTIVES_INBOX.json"
TASKS_FILE="$ROOT/ops/TASKS.json"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ─── Leer directivas entrantes ────────────────────────────────────────
DIRECTIVE_COUNT=$(jq 'length' "$INPUT_FILE")
echo "[apply] Procesando $DIRECTIVE_COUNT directivas de: $INPUT_FILE"
echo ""

if [ "$DIRECTIVE_COUNT" -eq 0 ]; then
  echo "Sin directivas para procesar."
  exit 0
fi

# ─── Obtener siguiente ID para tasks ─────────────────────────────────
LAST_TASK_ID=$(jq -r '.[].id' "$TASKS_FILE" | sort | tail -1 | sed 's/T-//')
NEXT_TASK_NUM=$((10#$LAST_TASK_ID + 1))

# ─── Procesar cada directiva ─────────────────────────────────────────
TASKS_ADDED=0
DIRECTIVES_ADDED=0

for i in $(seq 0 $((DIRECTIVE_COUNT - 1))); do
  DIR_ID=$(jq -r ".[$i].id // empty" "$INPUT_FILE")
  DIR_TITLE=$(jq -r ".[$i].title // empty" "$INPUT_FILE")
  DIR_BODY=$(jq -r ".[$i].body // empty" "$INPUT_FILE")
  DIR_SOURCE=$(jq -r ".[$i].source // \"gpt\"" "$INPUT_FILE")

  if [ -z "$DIR_ID" ] || [ -z "$DIR_TITLE" ]; then
    echo "SKIP: directiva $i sin id o title"
    continue
  fi

  # Verificar si ya existe en inbox
  EXISTS=$(jq --arg id "$DIR_ID" '[.[] | select(.id == $id)] | length' "$INBOX_FILE")
  if [ "$EXISTS" -gt 0 ]; then
    echo "SKIP: $DIR_ID ya existe en inbox"
    continue
  fi

  echo "ADD: $DIR_ID - $DIR_TITLE"

  # Agregar a DIRECTIVES_INBOX.json
  DIRECTIVE_ENTRY=$(jq -n \
    --arg id "$DIR_ID" \
    --arg now "$NOW" \
    --arg source "$DIR_SOURCE" \
    --arg title "$DIR_TITLE" \
    --arg body "$DIR_BODY" \
    --argjson criteria "$(jq ".[$i].acceptance_criteria // []" "$INPUT_FILE")" \
    --argjson tasks "$(jq ".[$i].tasks_to_create // []" "$INPUT_FILE")" \
    '{
      id: $id,
      created_at: $now,
      source: $source,
      status: "PENDING",
      title: $title,
      body: $body,
      acceptance_criteria: $criteria,
      tasks_to_create: $tasks,
      applied_at: null,
      applied_by: null,
      rejection_reason: null
    }')

  # Append a inbox
  jq --argjson entry "$DIRECTIVE_ENTRY" '. += [$entry]' "$INBOX_FILE" > "${INBOX_FILE}.tmp"
  mv "${INBOX_FILE}.tmp" "$INBOX_FILE"
  DIRECTIVES_ADDED=$((DIRECTIVES_ADDED + 1))

  # Crear tasks asociadas
  TASK_COUNT=$(jq ".[$i].tasks_to_create // [] | length" "$INPUT_FILE")
  for j in $(seq 0 $((TASK_COUNT - 1))); do
    TASK_TITLE=$(jq -r ".[$i].tasks_to_create[$j].title" "$INPUT_FILE")
    TASK_PHASE=$(jq -r ".[$i].tasks_to_create[$j].phase // 0" "$INPUT_FILE")
    TASK_DEPENDS=$(jq ".[$i].tasks_to_create[$j].depends_on // []" "$INPUT_FILE")
    TASK_BLOCKED=$(jq ".[$i].tasks_to_create[$j].blocked_by // []" "$INPUT_FILE")

    TASK_ID=$(printf "T-%03d" "$NEXT_TASK_NUM")

    echo "  TASK: $TASK_ID - $TASK_TITLE"

    TASK_ENTRY=$(jq -n \
      --arg id "$TASK_ID" \
      --argjson phase "$TASK_PHASE" \
      --arg title "$TASK_TITLE" \
      --argjson depends "$TASK_DEPENDS" \
      --argjson blocked "$TASK_BLOCKED" \
      --arg dir_id "$DIR_ID" \
      '{
        id: $id,
        phase: $phase,
        title: $title,
        status: "ready",
        branch: ("task/" + $id),
        depends_on: $depends,
        blocked_by: $blocked,
        directive_id: $dir_id
      }')

    jq --argjson entry "$TASK_ENTRY" '. += [$entry]' "$TASKS_FILE" > "${TASKS_FILE}.tmp"
    mv "${TASKS_FILE}.tmp" "$TASKS_FILE"

    NEXT_TASK_NUM=$((NEXT_TASK_NUM + 1))
    TASKS_ADDED=$((TASKS_ADDED + 1))
  done
done

echo ""
echo "[apply] Resultado: $DIRECTIVES_ADDED directivas agregadas, $TASKS_ADDED tasks creadas."
echo "[apply] Inbox: $INBOX_FILE"
echo "[apply] Tasks: $TASKS_FILE"
echo ""
echo "Siguiente paso: Claude toma tasks READY de TASKS.json y ejecuta con run_agent.sh"
