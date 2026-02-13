#!/usr/bin/env bash
set -euo pipefail

# ─── test_jq_timestamps.sh ──────────────────────────────────────────
# Sanity check: verifica que jq puede parsear los 4 formatos de
# timestamp que Supabase devuelve, usando la misma normalizacion
# que runner_local.sh sweep_stuck_tasks().
#
# Uso: ./scripts/test_jq_timestamps.sh

PASS=0
FAIL=0

check() {
  local label="$1"
  local ts="$2"
  local result=""

  result=$(echo "\"$ts\"" | jq -r '
    . as $raw
    | sub("\\+00:00$";"Z")
    | sub("\\.[0-9]+\\+00:00$";"Z")
    | sub("\\.[0-9]+Z$";"Z")
    | fromdateiso8601
  ' 2>&1) || true

  if echo "$result" | grep -q "^[0-9]"; then
    echo "  OK  $label => $result"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label => $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== jq timestamp parsing sanity check ==="
echo ""

check "ISO simple (Z)"               "2026-02-13T02:21:33Z"
check "ISO con microseconds+Z"       "2026-02-13T02:21:33.801Z"
check "ISO con +00:00"               "2026-02-13T02:21:33+00:00"
check "ISO con microseconds+00:00"   "2026-02-13T02:21:33.801+00:00"

echo ""
echo "Resultado: ${PASS} OK, ${FAIL} FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "ERROR: hay formatos que no parsean correctamente"
  exit 1
fi

echo "Todos los formatos parsean correctamente."
exit 0
