#!/usr/bin/env bash
set -euo pipefail

# ─── maintenance_export_runs.sh ──────────────────────────────────────
# Exporta runs, steps y file_changes desde DB a archivos locales.
# Útil antes de limpieza/dedupe para backup.
#
# Uso:
#   ./scripts/maintenance_export_runs.sh [--since_days N] [--out_dir PATH]
#
# Opciones:
#   --since_days N    Exportar solo runs de últimos N días (default: 30)
#   --out_dir PATH    Directorio de salida (default: reports/maintenance/export_<timestamp>)
#
# Output:
#   - run_logs.json
#   - run_steps.json
#   - file_changes.json
#   - summary.txt

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Config ──────────────────────────────────────────────────────────
API_BASE_URL="${API_BASE_URL:-https://elruso.onrender.com}"
SINCE_DAYS=30
OUT_DIR=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --since_days)
      SINCE_DAYS="$2"
      shift 2
      ;;
    --out_dir)
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--since_days N] [--out_dir PATH]"
      exit 1
      ;;
  esac
done

# Default out_dir
if [ -z "$OUT_DIR" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  OUT_DIR="$ROOT/reports/maintenance/export_$TIMESTAMP"
fi

mkdir -p "$OUT_DIR"

echo "=== Elruso Maintenance Export ==="
echo "  API: $API_BASE_URL"
echo "  Since: last $SINCE_DAYS days"
echo "  Output: $OUT_DIR"
echo ""

# ─── Helper ──────────────────────────────────────────────────────────
log() { echo "[export] $*"; }

# ─── Fetch data ──────────────────────────────────────────────────────
log "Fetching run_logs..."
curl -sf "$API_BASE_URL/runs" | jq '.data' > "$OUT_DIR/run_logs.json" || {
  log "ERROR: Failed to fetch runs"
  exit 1
}

RUN_COUNT=$(jq 'length' "$OUT_DIR/run_logs.json")
log "  Fetched $RUN_COUNT runs"

# Extract run IDs para fetch details
log "Extracting run IDs..."
jq -r '.[] | .id' "$OUT_DIR/run_logs.json" > "$OUT_DIR/run_ids.txt"

# Fetch run details (steps + file_changes)
log "Fetching run details (steps + file_changes)..."
STEPS_JSON="[]"
FILE_CHANGES_JSON="[]"

while read -r run_id; do
  DETAIL=$(curl -sf "$API_BASE_URL/runs/$run_id" | jq '.data') || continue

  # Extraer steps
  STEPS=$(echo "$DETAIL" | jq -c '.steps // []')
  STEPS_JSON=$(echo "$STEPS_JSON" | jq --argjson new "$STEPS" '. + $new')

  # Extraer file_changes
  FC=$(echo "$DETAIL" | jq -c '.file_changes // []')
  FILE_CHANGES_JSON=$(echo "$FILE_CHANGES_JSON" | jq --argjson new "$FC" '. + $new')
done < "$OUT_DIR/run_ids.txt"

echo "$STEPS_JSON" | jq . > "$OUT_DIR/run_steps.json"
echo "$FILE_CHANGES_JSON" | jq . > "$OUT_DIR/file_changes.json"

STEPS_COUNT=$(jq 'length' "$OUT_DIR/run_steps.json")
FC_COUNT=$(jq 'length' "$OUT_DIR/file_changes.json")

log "  Steps: $STEPS_COUNT"
log "  File changes: $FC_COUNT"

# ─── Summary ─────────────────────────────────────────────────────────
cat > "$OUT_DIR/summary.txt" <<EOF
Elruso Maintenance Export
=========================

Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
API: $API_BASE_URL
Since: last $SINCE_DAYS days

Counts:
- Runs: $RUN_COUNT
- Steps: $STEPS_COUNT
- File changes: $FC_COUNT

Files:
- run_logs.json ($RUN_COUNT records)
- run_steps.json ($STEPS_COUNT records)
- file_changes.json ($FC_COUNT records)

This export can be used for:
- Backup before cleanup
- Analysis/auditing
- Restore if needed
EOF

log ""
log "Export complete: $OUT_DIR"
log "  Runs: $RUN_COUNT"
log "  Steps: $STEPS_COUNT"
log "  File changes: $FC_COUNT"
log ""
log "Summary: $OUT_DIR/summary.txt"
