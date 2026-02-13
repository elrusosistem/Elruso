#!/usr/bin/env bash
set -euo pipefail

# ─── apply_gpt_directives.sh ──────────────────────────────────────────
# Lee directivas de GPT (JSON) y las envia a la API:
# 1. POST /ops/directives — crea directiva en DB
# 2. POST /ops/tasks — crea tasks asociadas en DB
#
# NO ejecuta nada. Solo transforma directivas en tasks via API.
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
  echo "Error: el archivo no es JSON valido."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"

# ─── Verificar que API responde ──────────────────────────────────────
if ! curl -sf "${API_BASE_URL}/health" >/dev/null 2>&1; then
  echo "ERROR: API no responde en ${API_BASE_URL}"
  echo "  Iniciar con: pnpm --filter @elruso/api dev"
  echo "  O configurar API_BASE_URL para apuntar a produccion."
  exit 1
fi

# ─── Helper: POST a API ──────────────────────────────────────────────
post_api() {
  local endpoint="$1"
  local body="$2"
  local response
  response=$(curl -sf -X POST "${API_BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "$body" 2>&1) || {
    echo "ERROR: POST ${endpoint} fallo: $response"
    return 1
  }

  local ok
  ok=$(echo "$response" | jq -r '.ok')
  if [ "$ok" != "true" ]; then
    local err
    err=$(echo "$response" | jq -r '.error // "desconocido"')
    echo "ERROR: POST ${endpoint}: $err"
    return 1
  fi
  echo "$response"
  return 0
}

# ─── Leer directivas entrantes ────────────────────────────────────────
DIRECTIVE_COUNT=$(jq 'length' "$INPUT_FILE")
echo "[apply] Procesando $DIRECTIVE_COUNT directivas de: $INPUT_FILE"
echo "[apply] API: $API_BASE_URL"
echo ""

if [ "$DIRECTIVE_COUNT" -eq 0 ]; then
  echo "Sin directivas para procesar."
  exit 0
fi

# ─── Obtener siguiente ID para tasks ─────────────────────────────────
# Leer tasks existentes de API para determinar proximo ID
EXISTING_TASKS=$(curl -sf "${API_BASE_URL}/ops/tasks" | jq -r '.data[].id' 2>/dev/null | sort || echo "")
LAST_TASK_ID=$(echo "$EXISTING_TASKS" | grep -E '^T-[0-9]+$' | tail -1 | sed 's/T-//' || echo "0")
if [ -z "$LAST_TASK_ID" ] || [ "$LAST_TASK_ID" = "0" ]; then
  LAST_TASK_ID="0"
fi
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

  echo "ADD: $DIR_ID - $DIR_TITLE"

  # POST directiva a API
  DIRECTIVE_BODY=$(jq -n \
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
      tasks_to_create: $tasks
    }')

  if post_api "/ops/directives" "$DIRECTIVE_BODY" >/dev/null; then
    DIRECTIVES_ADDED=$((DIRECTIVES_ADDED + 1))
  else
    echo "  WARN: fallo al crear directiva $DIR_ID, continuando..."
    continue
  fi

  # Crear tasks asociadas via API
  TASK_COUNT=$(jq ".[$i].tasks_to_create // [] | length" "$INPUT_FILE")
  for j in $(seq 0 $((TASK_COUNT - 1))); do
    TASK_TITLE=$(jq -r ".[$i].tasks_to_create[$j].title" "$INPUT_FILE")
    TASK_PHASE=$(jq -r ".[$i].tasks_to_create[$j].phase // 0" "$INPUT_FILE")
    TASK_DEPENDS=$(jq ".[$i].tasks_to_create[$j].depends_on // []" "$INPUT_FILE")
    TASK_BLOCKED=$(jq ".[$i].tasks_to_create[$j].blocked_by // []" "$INPUT_FILE")

    TASK_ID=$(printf "T-%03d" "$NEXT_TASK_NUM")

    echo "  TASK: $TASK_ID - $TASK_TITLE"

    TASK_BODY=$(jq -n \
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

    if post_api "/ops/tasks" "$TASK_BODY" >/dev/null; then
      NEXT_TASK_NUM=$((NEXT_TASK_NUM + 1))
      TASKS_ADDED=$((TASKS_ADDED + 1))
    else
      echo "    WARN: fallo al crear task $TASK_ID"
    fi
  done
done

echo ""
echo "[apply] Resultado: $DIRECTIVES_ADDED directivas creadas, $TASKS_ADDED tasks creadas."
echo "[apply] Todo guardado en DB via API."
echo ""
echo "Siguiente paso: Claude toma tasks READY y ejecuta con run_agent.sh"
