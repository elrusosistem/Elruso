#!/usr/bin/env bash
set -euo pipefail

# ─── ops_sync_push.sh — Archivos ops/*.json → Supabase DB ────────────
# Upsert TASKS.json, REQUESTS.json, DIRECTIVES_INBOX.json a DB via REST API.
# Uso:
#   ./scripts/ops_sync_push.sh              # ejecuta upsert
#   ./scripts/ops_sync_push.sh --dry-run    # muestra diff sin escribir

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPS_DIR="$ROOT_DIR/ops"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo "=== ops_sync_push: DRY RUN (sin escritura) ==="
else
  echo "=== ops_sync_push: Archivos → DB ==="
fi

# ─── Dependencias ─────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq es requerido. Instalar: brew install jq"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "ERROR: curl es requerido."
  exit 1
fi

# ─── Cargar env vars ──────────────────────────────────────────────────
# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR/load_vault_env.sh"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos."
  echo "  Cargar via load_vault_env.sh o exportar manualmente."
  exit 1
fi

API_URL="${SUPABASE_URL}/rest/v1"
AUTH_HEADERS=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" -H "Content-Type: application/json")

# ─── Helper: GET tabla completa ───────────────────────────────────────
fetch_table() {
  local table="$1"
  local order="${2:-id}"
  curl -sf "${API_URL}/${table}?order=${order}" "${AUTH_HEADERS[@]}" -H "Prefer: return=representation" || echo "[]"
}

# ─── Helper: comparar campo a campo ──────────────────────────────────
show_diff() {
  local label="$1"
  local file_data="$2"
  local db_data="$3"
  local key_field="${4:-id}"

  local file_ids
  file_ids=$(echo "$file_data" | jq -r ".[].${key_field}" | sort)
  local db_ids
  db_ids=$(echo "$db_data" | jq -r ".[].${key_field}" | sort)

  local has_diff=false

  # IDs en archivo pero no en DB (nuevos)
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if ! echo "$db_ids" | grep -qx "$id"; then
      echo "  + NUEVO: $id"
      has_diff=true
    fi
  done <<< "$file_ids"

  # IDs en DB pero no en archivo (huerfanos)
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if ! echo "$file_ids" | grep -qx "$id"; then
      echo "  - HUERFANO en DB (no en archivo): $id"
      has_diff=true
    fi
  done <<< "$db_ids"

  # Comparar campos de registros que existen en ambos
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    local file_row db_row
    file_row=$(echo "$file_data" | jq -c --arg id "$id" "[.[] | select(.${key_field} == \$id)][0] // empty")
    db_row=$(echo "$db_data" | jq -c --arg id "$id" "[.[] | select(.${key_field} == \$id)][0] // empty")

    [ -z "$file_row" ] && continue
    [ -z "$db_row" ] && continue

    # Comparar solo campos del archivo (ignorar created_at, updated_at de DB)
    local file_keys
    file_keys=$(echo "$file_row" | jq -r 'keys[]')
    while IFS= read -r key; do
      [ -z "$key" ] && continue
      local file_val db_val
      file_val=$(echo "$file_row" | jq -c --arg k "$key" '.[$k]')
      db_val=$(echo "$db_row" | jq -c --arg k "$key" '.[$k]')

      if [ "$file_val" != "$db_val" ]; then
        echo "  ~ $id.$key: DB=$db_val → ARCHIVO=$file_val"
        has_diff=true
      fi
    done <<< "$file_keys"
  done <<< "$file_ids"

  if [ "$has_diff" = false ]; then
    echo "  (sin diferencias)"
  fi
}

# ─── Columnas validas por tabla (evita schema mismatch) ──────────────
get_table_columns() {
  case "$1" in
    ops_tasks)      echo "id phase title status branch depends_on blocked_by directive_id" ;;
    ops_requests)   echo "id service type scopes purpose where_to_set validation_cmd status provided_at" ;;
    ops_directives) echo "id created_at source status title body acceptance_criteria tasks_to_create applied_at applied_by rejection_reason" ;;
    *)              echo "" ;;
  esac
}

# ─── Helper: sanitizar row (solo columnas validas) ───────────────────
sanitize_row() {
  local table="$1"
  local row="$2"
  local cols
  cols=$(get_table_columns "$table")
  if [ -z "$cols" ]; then
    echo "$row"
    return
  fi
  # Construir filtro jq: pick solo columnas validas
  local jq_filter
  jq_filter=$(echo "$cols" | tr ' ' '\n' | awk '{printf "  \"%s\": .[\"%s\"],\n", $1, $1}' | sed '$ s/,$//')
  echo "$row" | jq -c "{${jq_filter}} | with_entries(select(.value != null))"
}

# ─── Helper: upsert un registro ──────────────────────────────────────
upsert_row() {
  local table="$1"
  local row="$2"
  # Sanitizar: solo columnas que existen en la tabla
  local clean_row
  clean_row=$(sanitize_row "$table" "$row")
  local response
  response=$(curl -s -X POST "${API_URL}/${table}" \
    "${AUTH_HEADERS[@]}" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    -d "$clean_row" 2>&1)
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "    ERROR upserting (curl): $response"
    return 1
  fi
  # Verificar si hay error en response
  local err_code
  err_code=$(echo "$response" | jq -r '.code // empty' 2>/dev/null)
  if [ -n "$err_code" ]; then
    local err_msg
    err_msg=$(echo "$response" | jq -r '.message // "desconocido"' 2>/dev/null)
    echo "    ERROR upserting: [$err_code] $err_msg"
    return 1
  fi
  return 0
}

# ═══════════════════════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════════════════════
TASKS_FILE="$OPS_DIR/TASKS.json"
if [ -f "$TASKS_FILE" ]; then
  echo ""
  echo "--- TASKS (ops_tasks) ---"
  FILE_TASKS=$(jq -c '.' "$TASKS_FILE")
  DB_TASKS=$(fetch_table "ops_tasks" "id")

  show_diff "tasks" "$FILE_TASKS" "$DB_TASKS" "id"

  if [ "$DRY_RUN" = false ]; then
    COUNT=$(echo "$FILE_TASKS" | jq 'length')
    for i in $(seq 0 $((COUNT - 1))); do
      ROW=$(echo "$FILE_TASKS" | jq -c ".[$i]")
      ID=$(echo "$ROW" | jq -r '.id')
      if upsert_row "ops_tasks" "$ROW"; then
        echo "  Upserted: $ID"
      fi
    done
  fi
else
  echo "WARN: $TASKS_FILE no encontrado"
fi

# ═══════════════════════════════════════════════════════════════════════
# REQUESTS
# ═══════════════════════════════════════════════════════════════════════
REQUESTS_FILE="$OPS_DIR/REQUESTS.json"
if [ -f "$REQUESTS_FILE" ]; then
  echo ""
  echo "--- REQUESTS (ops_requests) ---"
  FILE_REQUESTS=$(jq -c '.' "$REQUESTS_FILE")
  DB_REQUESTS=$(fetch_table "ops_requests" "id")

  show_diff "requests" "$FILE_REQUESTS" "$DB_REQUESTS" "id"

  if [ "$DRY_RUN" = false ]; then
    COUNT=$(echo "$FILE_REQUESTS" | jq 'length')
    for i in $(seq 0 $((COUNT - 1))); do
      ROW=$(echo "$FILE_REQUESTS" | jq -c ".[$i]")
      ID=$(echo "$ROW" | jq -r '.id')
      if upsert_row "ops_requests" "$ROW"; then
        echo "  Upserted: $ID"
      fi
    done
  fi
else
  echo "WARN: $REQUESTS_FILE no encontrado"
fi

# ═══════════════════════════════════════════════════════════════════════
# DIRECTIVES
# ═══════════════════════════════════════════════════════════════════════
DIRECTIVES_FILE="$OPS_DIR/DIRECTIVES_INBOX.json"
if [ -f "$DIRECTIVES_FILE" ]; then
  echo ""
  echo "--- DIRECTIVES (ops_directives) ---"
  FILE_DIRECTIVES=$(jq -c '.' "$DIRECTIVES_FILE")
  DB_DIRECTIVES=$(fetch_table "ops_directives" "created_at")

  DIRECTIVE_COUNT=$(echo "$FILE_DIRECTIVES" | jq 'length')
  if [ "$DIRECTIVE_COUNT" -eq 0 ]; then
    echo "  (archivo vacio, nada que sincronizar)"
  else
    show_diff "directives" "$FILE_DIRECTIVES" "$DB_DIRECTIVES" "id"

    if [ "$DRY_RUN" = false ]; then
      for i in $(seq 0 $((DIRECTIVE_COUNT - 1))); do
        ROW=$(echo "$FILE_DIRECTIVES" | jq -c ".[$i]")
        ID=$(echo "$ROW" | jq -r '.id')
        if upsert_row "ops_directives" "$ROW"; then
          echo "  Upserted: $ID"
        fi
      done
    fi
  fi
else
  echo "WARN: $DIRECTIVES_FILE no encontrado"
fi

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "=== DRY RUN completado. Ejecutar sin --dry-run para aplicar cambios. ==="
else
  echo "=== Push completado ==="
fi
