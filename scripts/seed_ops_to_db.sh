#!/usr/bin/env bash
set -euo pipefail

# seed_ops_to_db.sh — Upsert de ops/*.json a tablas ops_* en Supabase
# Requiere: DATABASE_URL, jq, psql

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPS_DIR="$ROOT_DIR/ops"

# ─── Cargar env vars desde vault local ────────────────────────────────
# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR/load_vault_env.sh"

# ─── Validaciones ────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL no configurada. Ver ops/REQUESTS.json (REQ-005)"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq es requerido. Instalar: brew install jq"
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql es requerido. Ver ops/RUNBOOK.md"
  exit 1
fi

echo "=== Seed ops JSON → DB ==="
echo "  Database: ${DATABASE_URL%%@*}@..."

# ─── REQUESTS ────────────────────────────────────────────────────────
REQUESTS_FILE="$OPS_DIR/REQUESTS.json"
if [ -f "$REQUESTS_FILE" ]; then
  echo ""
  echo "--- ops_requests ---"
  COUNT=$(jq 'length' "$REQUESTS_FILE")
  echo "  Encontrados: $COUNT registros"

  for i in $(seq 0 $((COUNT - 1))); do
    ROW=$(jq -c ".[$i]" "$REQUESTS_FILE")
    ID=$(echo "$ROW" | jq -r '.id')
    SERVICE=$(echo "$ROW" | jq -r '.service')
    TYPE=$(echo "$ROW" | jq -r '.type')
    SCOPES=$(echo "$ROW" | jq -c '.scopes')
    PURPOSE=$(echo "$ROW" | jq -r '.purpose')
    WHERE_TO_SET=$(echo "$ROW" | jq -r '.where_to_set')
    VALIDATION_CMD=$(echo "$ROW" | jq -r '.validation_cmd')
    STATUS=$(echo "$ROW" | jq -r '.status')

    psql "$DATABASE_URL" -q -c "
      INSERT INTO ops_requests (id, service, type, scopes, purpose, where_to_set, validation_cmd, status)
      VALUES (\$\$${ID}\$\$, \$\$${SERVICE}\$\$, \$\$${TYPE}\$\$, '${SCOPES}'::jsonb, \$\$${PURPOSE}\$\$, \$\$${WHERE_TO_SET}\$\$, \$\$${VALIDATION_CMD}\$\$, \$\$${STATUS}\$\$)
      ON CONFLICT (id) DO UPDATE SET
        service = EXCLUDED.service,
        type = EXCLUDED.type,
        scopes = EXCLUDED.scopes,
        purpose = EXCLUDED.purpose,
        where_to_set = EXCLUDED.where_to_set,
        validation_cmd = EXCLUDED.validation_cmd,
        status = EXCLUDED.status,
        updated_at = NOW();
    "
    echo "  Upserted: $ID"
  done
fi

# ─── TASKS ───────────────────────────────────────────────────────────
TASKS_FILE="$OPS_DIR/TASKS.json"
if [ -f "$TASKS_FILE" ]; then
  echo ""
  echo "--- ops_tasks ---"
  COUNT=$(jq 'length' "$TASKS_FILE")
  echo "  Encontrados: $COUNT registros"

  for i in $(seq 0 $((COUNT - 1))); do
    ROW=$(jq -c ".[$i]" "$TASKS_FILE")
    ID=$(echo "$ROW" | jq -r '.id')
    PHASE=$(echo "$ROW" | jq -r '.phase')
    TITLE=$(echo "$ROW" | jq -r '.title')
    STATUS=$(echo "$ROW" | jq -r '.status')
    BRANCH=$(echo "$ROW" | jq -r '.branch')
    DEPENDS_ON=$(echo "$ROW" | jq -c '.depends_on')
    BLOCKED_BY=$(echo "$ROW" | jq -c '.blocked_by')
    DIRECTIVE_ID=$(echo "$ROW" | jq -r '.directive_id // empty')

    DIRECTIVE_SQL="NULL"
    if [ -n "$DIRECTIVE_ID" ]; then
      DIRECTIVE_SQL="\$\$${DIRECTIVE_ID}\$\$"
    fi

    psql "$DATABASE_URL" -q -c "
      INSERT INTO ops_tasks (id, phase, title, status, branch, depends_on, blocked_by, directive_id)
      VALUES (\$\$${ID}\$\$, ${PHASE}, \$\$${TITLE}\$\$, \$\$${STATUS}\$\$, \$\$${BRANCH}\$\$, '${DEPENDS_ON}'::jsonb, '${BLOCKED_BY}'::jsonb, ${DIRECTIVE_SQL})
      ON CONFLICT (id) DO UPDATE SET
        phase = EXCLUDED.phase,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        branch = EXCLUDED.branch,
        depends_on = EXCLUDED.depends_on,
        blocked_by = EXCLUDED.blocked_by,
        directive_id = EXCLUDED.directive_id,
        updated_at = NOW();
    "
    echo "  Upserted: $ID"
  done
fi

# ─── DIRECTIVES ──────────────────────────────────────────────────────
DIRECTIVES_FILE="$OPS_DIR/DIRECTIVES_INBOX.json"
if [ -f "$DIRECTIVES_FILE" ]; then
  echo ""
  echo "--- ops_directives ---"
  COUNT=$(jq 'length' "$DIRECTIVES_FILE")
  echo "  Encontrados: $COUNT registros"

  if [ "$COUNT" -eq 0 ]; then
    echo "  (vacío, nada que seedear)"
  fi

  for i in $(seq 0 $((COUNT - 1))); do
    ROW=$(jq -c ".[$i]" "$DIRECTIVES_FILE")
    ID=$(echo "$ROW" | jq -r '.id')
    CREATED_AT=$(echo "$ROW" | jq -r '.created_at // empty')
    SOURCE=$(echo "$ROW" | jq -r '.source // "gpt"')
    STATUS=$(echo "$ROW" | jq -r '.status // "PENDING"')
    TITLE=$(echo "$ROW" | jq -r '.title')
    BODY=$(echo "$ROW" | jq -r '.body // ""')
    ACCEPTANCE=$(echo "$ROW" | jq -c '.acceptance_criteria // []')
    TASKS_TO_CREATE=$(echo "$ROW" | jq -c '.tasks_to_create // []')

    CREATED_AT_SQL="NOW()"
    if [ -n "$CREATED_AT" ]; then
      CREATED_AT_SQL="\$\$${CREATED_AT}\$\$::timestamptz"
    fi

    psql "$DATABASE_URL" -q -c "
      INSERT INTO ops_directives (id, created_at, source, status, title, body, acceptance_criteria, tasks_to_create)
      VALUES (\$\$${ID}\$\$, ${CREATED_AT_SQL}, \$\$${SOURCE}\$\$, \$\$${STATUS}\$\$, \$\$${TITLE}\$\$, \$\$${BODY}\$\$, '${ACCEPTANCE}'::jsonb, '${TASKS_TO_CREATE}'::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        acceptance_criteria = EXCLUDED.acceptance_criteria,
        tasks_to_create = EXCLUDED.tasks_to_create,
        updated_at = NOW();
    "
    echo "  Upserted: $ID"
  done
fi

echo ""
echo "=== Seed completado ==="
