#!/usr/bin/env bash
set -euo pipefail

# ─── ops_sync_pull.sh — Supabase DB → Archivos ops/*.json ────────────
# GET de ops_tasks, ops_requests, ops_directives via REST API.
# Transforma con jq para matchear formato de archivos existentes.
# Uso:
#   ./scripts/ops_sync_pull.sh              # escribe archivos
#   ./scripts/ops_sync_pull.sh --dry-run    # muestra diff sin escribir

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPS_DIR="$ROOT_DIR/ops"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
  echo "=== ops_sync_pull: DRY RUN (sin escritura) ==="
else
  echo "=== ops_sync_pull: DB → Archivos ==="
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
AUTH_HEADERS=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

# ─── Helper: GET tabla completa ───────────────────────────────────────
fetch_table() {
  local table="$1"
  local order="${2:-id}"
  curl -sf "${API_URL}/${table}?order=${order}" "${AUTH_HEADERS[@]}" || echo "[]"
}

# ─── Helper: diff dos JSONs ──────────────────────────────────────────
show_json_diff() {
  local label="$1"
  local current_file="$2"
  local new_data="$3"

  if [ ! -f "$current_file" ]; then
    echo "  (archivo no existe, se creara)"
    return
  fi

  local current_data
  current_data=$(jq -S '.' "$current_file")
  local new_sorted
  new_sorted=$(echo "$new_data" | jq -S '.')

  if [ "$current_data" = "$new_sorted" ]; then
    echo "  (sin diferencias)"
  else
    # Mostrar diff legible
    diff <(echo "$current_data") <(echo "$new_sorted") --unified=3 | head -60 || true
  fi
}

# ═══════════════════════════════════════════════════════════════════════
# TASKS
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "--- TASKS (ops_tasks → TASKS.json) ---"

DB_TASKS_RAW=$(fetch_table "ops_tasks" "id")
# Transformar: quitar created_at, updated_at para matchear formato archivo
DB_TASKS=$(echo "$DB_TASKS_RAW" | jq '[.[] | {
  id,
  phase,
  title,
  status,
  branch,
  depends_on,
  blocked_by
} + (if .directive_id then {directive_id} else {} end)]')

DB_TASKS_COUNT=$(echo "$DB_TASKS" | jq 'length')
echo "  Registros en DB: $DB_TASKS_COUNT"

show_json_diff "tasks" "$OPS_DIR/TASKS.json" "$DB_TASKS"

if [ "$DRY_RUN" = false ]; then
  echo "$DB_TASKS" | jq '.' > "$OPS_DIR/TASKS.json"
  echo "  Escrito: $OPS_DIR/TASKS.json"
fi

# ═══════════════════════════════════════════════════════════════════════
# REQUESTS
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "--- REQUESTS (ops_requests → REQUESTS.json) ---"

DB_REQUESTS_RAW=$(fetch_table "ops_requests" "id")
# Transformar: quitar created_at, updated_at para matchear formato archivo
DB_REQUESTS=$(echo "$DB_REQUESTS_RAW" | jq '[.[] | {
  id,
  service,
  type,
  scopes,
  purpose,
  where_to_set,
  validation_cmd,
  status
} + (if .provided_at then {provided_at} else {} end)
  + (if .value then {value} else {} end)]')

DB_REQUESTS_COUNT=$(echo "$DB_REQUESTS" | jq 'length')
echo "  Registros en DB: $DB_REQUESTS_COUNT"

show_json_diff "requests" "$OPS_DIR/REQUESTS.json" "$DB_REQUESTS"

if [ "$DRY_RUN" = false ]; then
  echo "$DB_REQUESTS" | jq '.' > "$OPS_DIR/REQUESTS.json"
  echo "  Escrito: $OPS_DIR/REQUESTS.json"
fi

# ═══════════════════════════════════════════════════════════════════════
# DIRECTIVES
# ═══════════════════════════════════════════════════════════════════════
echo ""
echo "--- DIRECTIVES (ops_directives → DIRECTIVES_INBOX.json) ---"

DB_DIRECTIVES_RAW=$(fetch_table "ops_directives" "created_at.desc")
# Transformar: quitar updated_at
DB_DIRECTIVES=$(echo "$DB_DIRECTIVES_RAW" | jq '[.[] | {
  id,
  created_at,
  source,
  status,
  title,
  body,
  acceptance_criteria,
  tasks_to_create,
  applied_at,
  applied_by,
  rejection_reason
}]')

DB_DIRECTIVES_COUNT=$(echo "$DB_DIRECTIVES" | jq 'length')
echo "  Registros en DB: $DB_DIRECTIVES_COUNT"

show_json_diff "directives" "$OPS_DIR/DIRECTIVES_INBOX.json" "$DB_DIRECTIVES"

if [ "$DRY_RUN" = false ]; then
  echo "$DB_DIRECTIVES" | jq '.' > "$OPS_DIR/DIRECTIVES_INBOX.json"
  echo "  Escrito: $OPS_DIR/DIRECTIVES_INBOX.json"
fi

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "=== DRY RUN completado. Ejecutar sin --dry-run para aplicar cambios. ==="
else
  echo "=== Pull completado ==="
fi
