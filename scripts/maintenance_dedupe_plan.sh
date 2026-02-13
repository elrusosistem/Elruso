#!/usr/bin/env bash
set -euo pipefail

# ─── maintenance_dedupe_plan.sh ──────────────────────────────────────
# Genera plan de deduplicación de runs sin borrar nada.
# Criterio: mismo task_id + mismo commit_hash + dentro de 10 min.
# Keep: el más nuevo (max started_at).
# Drop: el resto.
#
# Uso:
#   ./scripts/maintenance_dedupe_plan.sh [--out PATH]
#
# Output:
#   - dedupe_plan_<timestamp>.json con lista de run_ids to drop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Config ──────────────────────────────────────────────────────────
API_BASE_URL="${API_BASE_URL:-https://elruso.onrender.com}"
OUT_PATH=""
WINDOW_MINUTES=10

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --out)
      OUT_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--out PATH]"
      exit 1
      ;;
  esac
done

# Default out path
if [ -z "$OUT_PATH" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  OUT_DIR="$ROOT/reports/maintenance"
  mkdir -p "$OUT_DIR"
  OUT_PATH="$OUT_DIR/dedupe_plan_$TIMESTAMP.json"
fi

echo "=== Elruso Dedupe Plan Generator ==="
echo "  API: $API_BASE_URL"
echo "  Window: $WINDOW_MINUTES minutes"
echo "  Output: $OUT_PATH"
echo ""

# ─── Fetch runs ──────────────────────────────────────────────────────
echo "[plan] Fetching all runs..."
RUNS_JSON=$(curl -sf "$API_BASE_URL/runs" | jq '.data') || {
  echo "ERROR: Failed to fetch runs"
  exit 1
}

TOTAL_RUNS=$(echo "$RUNS_JSON" | jq 'length')
echo "  Total runs: $TOTAL_RUNS"

# ─── Generate dedupe plan ────────────────────────────────────────────
echo "[plan] Analyzing duplicates..."

DEDUPE_PLAN=$(echo "$RUNS_JSON" | jq --arg window "$WINDOW_MINUTES" '
# Simple duplicate detection: same task_id + commit_hash
# Keep newest (lexicographically last started_at), drop rest

# Group by task_id + commit_hash
group_by(.task_id + "-" + (.commit_hash // "null")) |

# For each group with duplicates
map(select(length > 1) |
  # Sort by started_at descending (newest first)
  sort_by(.started_at) | reverse |
  {
    keep: [.[0]],
    drop: .[1:]
  }
) |

# Flatten
{
  keep: (map(.keep) | flatten | unique_by(.id)),
  drop: (map(.drop) | flatten | unique_by(.id))
}
')

KEEP_COUNT=$(echo "$DEDUPE_PLAN" | jq '.keep | length')
DROP_COUNT=$(echo "$DEDUPE_PLAN" | jq '.drop | length')

echo "  Keep: $KEEP_COUNT runs"
echo "  Drop: $DROP_COUNT runs (duplicates)"

# ─── Save plan ───────────────────────────────────────────────────────
cat > "$OUT_PATH" <<EOF
{
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "api_base_url": "$API_BASE_URL",
  "window_minutes": $WINDOW_MINUTES,
  "total_runs": $TOTAL_RUNS,
  "keep_count": $KEEP_COUNT,
  "drop_count": $DROP_COUNT,
  "drop_run_ids": $(echo "$DEDUPE_PLAN" | jq '.drop | map(.id)')
}
EOF

echo ""
echo "[plan] Plan saved: $OUT_PATH"
echo "  Total: $TOTAL_RUNS runs"
echo "  Keep: $KEEP_COUNT runs"
echo "  Drop: $DROP_COUNT runs"
echo ""
echo "To apply this plan:"
echo "  ./scripts/maintenance_dedupe_apply.sh --plan $OUT_PATH --dry-run"
echo "  ./scripts/maintenance_dedupe_apply.sh --plan $OUT_PATH --apply"
