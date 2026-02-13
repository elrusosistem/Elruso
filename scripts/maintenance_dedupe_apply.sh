#!/usr/bin/env bash
set -euo pipefail

# ─── maintenance_dedupe_apply.sh ─────────────────────────────────────
# Aplica plan de deduplicación borrando runs duplicados.
# DESTRUCTIVO: borra data de DB.
# Requiere --apply para ejecutar (dry-run por default).
#
# Uso:
#   ./scripts/maintenance_dedupe_apply.sh --plan PATH [--dry-run | --apply]
#
# Opciones:
#   --plan PATH       Path al dedupe_plan.json
#   --dry-run         Solo muestra qué se borraría (default)
#   --apply           Ejecuta los deletes (DESTRUCTIVO)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# Load vault env for DATABASE_URL
# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR/load_vault_env.sh" 2>/dev/null || true

# ─── Config ──────────────────────────────────────────────────────────
PLAN_PATH=""
DRY_RUN=true

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --plan)
      PLAN_PATH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply)
      DRY_RUN=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 --plan PATH [--dry-run | --apply]"
      exit 1
      ;;
  esac
done

if [ -z "$PLAN_PATH" ]; then
  echo "ERROR: --plan PATH is required"
  exit 1
fi

if [ ! -f "$PLAN_PATH" ]; then
  echo "ERROR: Plan file not found: $PLAN_PATH"
  exit 1
fi

# Validate DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not configured."
  echo "  Run: source scripts/load_vault_env.sh"
  exit 1
fi

# Validate psql
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found."
  echo "  Install: brew install libpq && brew link --force libpq"
  exit 1
fi

echo "=== Elruso Dedupe Apply ==="
echo "  Plan: $PLAN_PATH"
echo "  Mode: $([ "$DRY_RUN" = true ] && echo "DRY-RUN" || echo "APPLY (DESTRUCTIVE)")"
echo ""

# ─── Read plan ───────────────────────────────────────────────────────
DROP_COUNT=$(jq -r '.drop_count' "$PLAN_PATH")
DROP_IDS=$(jq -r '.drop_run_ids | join(" ")' "$PLAN_PATH")

echo "[apply] Plan summary:"
echo "  Total to drop: $DROP_COUNT runs"
echo ""

if [ "$DROP_COUNT" -eq 0 ]; then
  echo "No duplicates to drop. Exiting."
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would delete $DROP_COUNT runs:"
  jq -r '.drop_run_ids[]' "$PLAN_PATH" | head -10
  if [ "$DROP_COUNT" -gt 10 ]; then
    echo "  ... and $((DROP_COUNT - 10)) more"
  fi
  echo ""
  echo "To apply:"
  echo "  $0 --plan $PLAN_PATH --apply"
  exit 0
fi

# ─── Apply (DESTRUCTIVE) ─────────────────────────────────────────────
echo ""
echo "⚠️  WARNING: This will DELETE $DROP_COUNT runs from the database."
echo "⚠️  This action is IRREVERSIBLE."
echo ""
read -p "Type 'yes-delete' to confirm: " CONFIRM

if [ "$CONFIRM" != "yes-delete" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "[apply] Deleting duplicates..."

# Build SQL for deletion (in correct order: steps, file_changes, run_logs)
SQL_DELETE=""

# 1. Delete run_steps
for run_id in $DROP_IDS; do
  SQL_DELETE+="DELETE FROM run_steps WHERE run_id = '$run_id';"$'\n'
done

# 2. Delete file_changes
for run_id in $DROP_IDS; do
  SQL_DELETE+="DELETE FROM file_changes WHERE run_id = '$run_id';"$'\n'
done

# 3. Delete run_logs
for run_id in $DROP_IDS; do
  SQL_DELETE+="DELETE FROM run_logs WHERE id = '$run_id';"$'\n'
done

# Execute in transaction
echo "$SQL_DELETE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q || {
  echo "ERROR: Deletion failed. Transaction rolled back."
  exit 1
}

echo "[apply] Deleted $DROP_COUNT runs"
echo ""

# ─── Verify ──────────────────────────────────────────────────────────
REMAINING=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM run_logs;")
echo "[apply] Verification:"
echo "  Remaining runs in DB: $REMAINING"
echo ""
echo "Dedupe complete."
