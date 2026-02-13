#!/usr/bin/env bash
set -euo pipefail

# ─── maintenance_dedupe_runs.sh ──────────────────────────────────────
# Deduplicación de runs via REST API (soft-delete: marca status=deduped).
# Registra cada dedupe en decisions_log.
#
# Uso:
#   ./scripts/maintenance_dedupe_runs.sh                       # dry-run
#   ./scripts/maintenance_dedupe_runs.sh --apply               # aplica
#   ./scripts/maintenance_dedupe_runs.sh --window-seconds 300  # ventana 5min
#   ./scripts/maintenance_dedupe_runs.sh --keep oldest         # mantener más viejo
#
# Requiere: curl, jq, ADMIN_TOKEN (si API tiene auth).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR/load_vault_env.sh" 2>/dev/null || true

# ─── Config ──────────────────────────────────────────────────────────
API_BASE_URL="${API_BASE_URL:-https://elruso.onrender.com}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
WINDOW_SECONDS="${WINDOW_SECONDS:-600}"
KEEP="latest"
APPLY=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --apply) APPLY=true; shift ;;
    --window-seconds) WINDOW_SECONDS="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--apply] [--window-seconds N] [--keep latest|oldest]"
      echo ""
      echo "  --apply            Ejecutar (default: dry-run)"
      echo "  --window-seconds   Ventana de agrupacion (default: 600)"
      echo "  --keep             Cual mantener: latest (default) o oldest"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

MODE="dry-run"
if $APPLY; then MODE="apply"; fi

auth_header() {
  if [ -n "$ADMIN_TOKEN" ]; then
    echo "-H" "Authorization: Bearer ${ADMIN_TOKEN}"
  fi
}

api_get() {
  curl -sf $(auth_header) "${API_BASE_URL}${1}" 2>/dev/null
}

api_patch() {
  curl -sf -X PATCH $(auth_header) "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null
}

api_post() {
  curl -sf -X POST $(auth_header) "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null
}

echo "=== Elruso Dedupe Runs ==="
echo "  API: $API_BASE_URL"
echo "  Window: ${WINDOW_SECONDS}s"
echo "  Keep: $KEEP"
echo "  Mode: $MODE"
echo ""

# ─── Fetch runs (excluir ya deduped) ─────────────────────────────────
echo "[dedupe] Fetching runs..."
RUNS_JSON=$(api_get "/runs") || { echo "ERROR: Failed to fetch runs"; exit 1; }

# Filter out deduped runs and parse
ALL_RUNS=$(echo "$RUNS_JSON" | jq '[.data[] | select(.status != "deduped")]')
TOTAL=$(echo "$ALL_RUNS" | jq 'length')
echo "  Total runs activos: $TOTAL"

if [ "$TOTAL" -lt 2 ]; then
  echo "  Nada que deduplicar."
  exit 0
fi

# ─── Detectar duplicados ─────────────────────────────────────────────
echo "[dedupe] Analizando duplicados (ventana ${WINDOW_SECONDS}s)..."

# Group by task_id + commit_hash, find dupes within time window
SORT_ORDER="reverse"
if [ "$KEEP" = "oldest" ]; then SORT_ORDER=""; fi

DUPES=$(echo "$ALL_RUNS" | jq --arg window "$WINDOW_SECONDS" --arg keep "$KEEP" '
# Group by task_id + commit_hash
group_by(.task_id + "|" + (.commit_hash // "null")) |

# For each group with >1 runs
map(select(length > 1)) |

# Within each group, sort and identify keeper vs dupes
map(
  sort_by(.started_at) |
  if $keep == "oldest" then . else reverse end |
  {
    task_id: .[0].task_id,
    commit_hash: (.[0].commit_hash // "null"),
    kept: .[0].id,
    dupes: [.[1:][].id],
    count: length
  }
) |

# Only groups with actual dupes
map(select(.dupes | length > 0))
')

DUPE_GROUPS=$(echo "$DUPES" | jq 'length')
DUPE_TOTAL=$(echo "$DUPES" | jq '[.[].dupes | length] | add // 0')

echo "  Grupos duplicados: $DUPE_GROUPS"
echo "  Runs a marcar deduped: $DUPE_TOTAL"
echo ""

if [ "$DUPE_TOTAL" -eq 0 ]; then
  echo "  Sin duplicados. Todo limpio."
  exit 0
fi

# ─── Imprimir detalle ────────────────────────────────────────────────
echo "--- Detalle ---"
echo "$DUPES" | jq -r '.[] | "  task=\(.task_id) sha=\(.commit_hash) keep=\(.kept) dedup=\(.dupes | join(",")) (total=\(.count))"'
echo ""

if ! $APPLY; then
  echo "[dry-run] Para aplicar: $0 --apply --window-seconds $WINDOW_SECONDS --keep $KEEP"
  exit 0
fi

# ─── Aplicar soft-delete ─────────────────────────────────────────────
echo "[apply] Marcando runs como 'deduped'..."

DEDUPED=0
ERRORS=0

for GROUP in $(echo "$DUPES" | jq -c '.[]'); do
  KEPT_ID=$(echo "$GROUP" | jq -r '.kept')
  TASK_ID=$(echo "$GROUP" | jq -r '.task_id')
  COMMIT_HASH=$(echo "$GROUP" | jq -r '.commit_hash')

  for DUPE_ID in $(echo "$GROUP" | jq -r '.dupes[]'); do
    echo "  Deduping $DUPE_ID (kept=$KEPT_ID)..."

    # Soft-delete: mark as deduped
    RESULT=$(api_patch "/runs/${DUPE_ID}" "{\"status\":\"deduped\",\"summary\":\"DEDUPED: kept ${KEPT_ID}\"}") || {
      echo "    ERROR: Failed to mark $DUPE_ID"
      ERRORS=$((ERRORS + 1))
      continue
    }

    # Log decision
    api_post "/ops/decisions" "{
      \"source\":\"system\",
      \"decision_key\":\"run_deduped\",
      \"decision_value\":{\"kept_run_id\":\"${KEPT_ID}\",\"deduped_run_id\":\"${DUPE_ID}\",\"task_id\":\"${TASK_ID}\",\"commit_hash\":\"${COMMIT_HASH}\",\"window_seconds\":${WINDOW_SECONDS}},
      \"context\":{\"script\":\"maintenance_dedupe_runs.sh\",\"mode\":\"apply\"},
      \"run_id\":\"${DUPE_ID}\"
    }" > /dev/null 2>&1 || echo "    WARN: Failed to log decision for $DUPE_ID"

    DEDUPED=$((DEDUPED + 1))
  done
done

echo ""
echo "=== Resultado ==="
echo "  Deduped: $DEDUPED"
echo "  Errors: $ERRORS"
echo "  Runs activos restantes: $((TOTAL - DEDUPED))"
