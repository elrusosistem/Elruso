#!/usr/bin/env bash
set -euo pipefail

# ops_sync.sh — Sincroniza ops JSON ↔ DB según disponibilidad
# Modo export (default): DB → ops/*.json
# Modo import: ops/*.json → DB (mismo que seed_ops_to_db.sh)
# Sin DB creds: confirma modo file-backed y sale ok

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPS_DIR="$ROOT_DIR/ops"

MODE="${1:-export}"

# ─── Validar modo ────────────────────────────────────────────────────
if [ "$MODE" != "export" ] && [ "$MODE" != "import" ]; then
  echo "Uso: ops_sync.sh [export|import]"
  echo "  export (default): DB → ops/*.json"
  echo "  import:           ops/*.json → DB (upsert idempotente)"
  exit 1
fi

# ─── Check DB creds ──────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "INFO: DATABASE_URL no configurada."
  echo "  Operando en modo file-backed (ops/*.json como source of truth)."
  echo "  Para activar DB-first, proveer REQ-005 (DATABASE_URL) y REQ-006 (psql)."
  exit 0
fi

if ! command -v psql &>/dev/null; then
  echo "WARN: psql no disponible. No se puede sincronizar con DB."
  echo "  Instalar: brew install libpq && brew link --force libpq"
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq es requerido. Instalar: brew install jq"
  exit 1
fi

# ─── IMPORT: ops/*.json → DB ─────────────────────────────────────────
if [ "$MODE" = "import" ]; then
  echo "=== ops_sync: IMPORT (ops/*.json → DB) ==="
  exec "$SCRIPT_DIR/seed_ops_to_db.sh"
fi

# ─── EXPORT: DB → ops/*.json ─────────────────────────────────────────
echo "=== ops_sync: EXPORT (DB → ops/*.json) ==="

# Export ops_requests
echo ""
echo "--- ops_requests → REQUESTS.json ---"
REQUESTS=$(psql "$DATABASE_URL" -t -A -c "
  SELECT json_agg(
    json_build_object(
      'id', id,
      'service', service,
      'type', type,
      'scopes', scopes,
      'purpose', purpose,
      'where_to_set', where_to_set,
      'validation_cmd', validation_cmd,
      'status', status,
      'provided_at', provided_at
    ) ORDER BY id
  ) FROM ops_requests;
" 2>/dev/null || echo "null")

if [ "$REQUESTS" != "null" ] && [ -n "$REQUESTS" ]; then
  echo "$REQUESTS" | jq '.' > "$OPS_DIR/REQUESTS.json"
  COUNT=$(echo "$REQUESTS" | jq 'length')
  echo "  Exportados: $COUNT registros"
else
  echo "  Tabla vacía o error. Manteniendo archivo existente."
fi

# Export ops_tasks
echo ""
echo "--- ops_tasks → TASKS.json ---"
TASKS=$(psql "$DATABASE_URL" -t -A -c "
  SELECT json_agg(
    json_build_object(
      'id', id,
      'phase', phase,
      'title', title,
      'status', status,
      'branch', branch,
      'depends_on', depends_on,
      'blocked_by', blocked_by,
      'directive_id', directive_id
    ) ORDER BY id
  ) FROM ops_tasks;
" 2>/dev/null || echo "null")

if [ "$TASKS" != "null" ] && [ -n "$TASKS" ]; then
  echo "$TASKS" | jq '.' > "$OPS_DIR/TASKS.json"
  COUNT=$(echo "$TASKS" | jq 'length')
  echo "  Exportados: $COUNT registros"
else
  echo "  Tabla vacía o error. Manteniendo archivo existente."
fi

# Export ops_directives
echo ""
echo "--- ops_directives → DIRECTIVES_INBOX.json ---"
DIRECTIVES=$(psql "$DATABASE_URL" -t -A -c "
  SELECT json_agg(
    json_build_object(
      'id', id,
      'created_at', created_at,
      'source', source,
      'status', status,
      'title', title,
      'body', body,
      'acceptance_criteria', acceptance_criteria,
      'tasks_to_create', tasks_to_create,
      'applied_at', applied_at,
      'applied_by', applied_by,
      'rejection_reason', rejection_reason
    ) ORDER BY created_at DESC
  ) FROM ops_directives;
" 2>/dev/null || echo "null")

if [ "$DIRECTIVES" != "null" ] && [ -n "$DIRECTIVES" ]; then
  echo "$DIRECTIVES" | jq '.' > "$OPS_DIR/DIRECTIVES_INBOX.json"
  COUNT=$(echo "$DIRECTIVES" | jq 'length')
  echo "  Exportados: $COUNT registros"
else
  echo "  Tabla vacía o sin directivas. Manteniendo archivo existente."
fi

echo ""
echo "=== Export completado ==="
