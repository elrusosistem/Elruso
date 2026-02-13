#!/usr/bin/env bash
set -euo pipefail

# maintenance_backlog_cleanup.sh — Limpieza idempotente del backlog
# Uso: ./scripts/maintenance_backlog_cleanup.sh [--dry-run|--apply]
# Default: --dry-run (no cambia nada)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load env vars
source "$SCRIPT_DIR/load_vault_env.sh"

API="${API_BASE_URL:-https://elruso.onrender.com}"
MODE="${1:---dry-run}"
TMP_DIR=$(mktemp -d)
export TMP_DIR
trap "rm -rf $TMP_DIR" EXIT

if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--apply" ]; then
  echo "Uso: $0 [--dry-run|--apply]"
  exit 1
fi

echo "=== Backlog Cleanup — $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Mode: $MODE"
echo "API: $API"
echo ""

# --- Fetch all tasks ---
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/ops/tasks" -o "$TMP_DIR/tasks.json"
TOTAL=$(python3 -c "import json; print(len(json.load(open('$TMP_DIR/tasks.json')).get('data',[])))")
echo "Total tasks in DB: $TOTAL"
echo ""

# --- Classify tasks to mark as DONE ---
python3 > "$TMP_DIR/to_done.json" << 'PYEOF'
import json, sys, os

tmp_dir = os.environ.get("TMP_DIR", "/tmp")
with open(os.path.join(tmp_dir, "tasks.json")) as f:
    data = json.load(f)
tasks = data.get("data", [])

to_done = []

# Already-implemented roadmap tasks still marked READY/RUNNING
already_done_ids = {
    "T-017",  # Stuck running — already completed
    "T-020",  # POST /runs — implemented
    "T-021",  # POST /directives — implemented
    "T-022",  # POST /tasks — implemented
    "T-040",  # Panel dashboard — implemented
    "T-041",  # Panel directivas — implemented
    "T-042",  # Panel diffs/file_changes — implemented
    "T-050",  # Runner 24/7 loop — implemented
    "T-051",  # Runner reintentos — implemented
}

# GPT-generated noise (duplicates of existing work)
gpt_noise_ids = {
    "T-GPT-1770951945000-memapi",   # Superseded by actual implementation
    "T-GPT-1770996000000-memtest",  # Duplicate
    "T-GPT-1770951852990-ek6p",     # Superseded by T-017
    "T-GPT-1770951852662-qvll",     # Superseded by actual tests
    "T-GPT-1770951853290-y93a",     # Sync scripts not needed
}

for t in tasks:
    tid = t.get("id", "")
    status = t.get("status", "")

    # Skip already done
    if status == "done":
        continue

    if tid in already_done_ids:
        to_done.append({"id": tid, "reason": "already_implemented", "title": t.get("title","")[:80]})
    elif tid in gpt_noise_ids:
        to_done.append({"id": tid, "reason": "gpt_noise_superseded", "title": t.get("title","")[:80]})

print(json.dumps(to_done))
PYEOF

COUNT=$(python3 -c "import json; print(len(json.load(open('$TMP_DIR/to_done.json'))))")
echo "Tasks to mark DONE: $COUNT"
echo ""

# --- Print details ---
python3 << PYEOF
import json
tasks = json.load(open("$TMP_DIR/to_done.json"))
for t in tasks:
    print(f"  -> {t['id']:>40} [{t['reason']}] {t['title']}")
PYEOF
echo ""

if [ "$COUNT" = "0" ]; then
  echo "Nothing to clean up. Backlog is already clean."
  echo ""
  echo "=== Current backlog summary ==="
  python3 << PYEOF
import json
from collections import Counter
tasks = json.load(open("$TMP_DIR/tasks.json")).get("data", [])
counts = Counter(t["status"] for t in tasks)
for s, c in sorted(counts.items()):
    print(f"  {s}: {c}")
PYEOF
  exit 0
fi

if [ "$MODE" = "--dry-run" ]; then
  echo "[DRY-RUN] Would mark $COUNT tasks as done."
  echo "[DRY-RUN] Would log backlog_cleanup decision."
  echo ""
  echo "Run with --apply to execute changes."
  exit 0
fi

# --- APPLY MODE ---
echo "Applying changes..."
echo ""

python3 -c "import json; [print(t['id']) for t in json.load(open('$TMP_DIR/to_done.json'))]" | while read -r TASK_ID; do
  echo -n "  Marking $TASK_ID as done... "

  HTTP_CODE=$(curl -s -o "$TMP_DIR/patch_result.json" -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"done"}' \
    "$API/ops/tasks/$TASK_ID")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "OK"
  else
    echo "HTTP $HTTP_CODE"
  fi
done

echo ""

# --- Log decision ---
echo "Logging backlog_cleanup decision..."

DECISION_VALUE=$(python3 << PYEOF
import json
tasks = json.load(open("$TMP_DIR/to_done.json"))
reasons = {}
for t in tasks:
    r = t["reason"]
    if r not in reasons:
        reasons[r] = []
    reasons[r].append(t["id"])
result = {
    "total_cleaned": len(tasks),
    "by_reason": reasons,
    "task_ids": [t["id"] for t in tasks]
}
print(json.dumps(result))
PYEOF
)

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -sf -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{
    \"source\": \"system\",
    \"decision_key\": \"backlog_cleanup\",
    \"decision_value\": $DECISION_VALUE,
    \"context\": {\"script\": \"maintenance_backlog_cleanup.sh\", \"mode\": \"apply\", \"timestamp\": \"$TIMESTAMP\"}
  }" \
  "$SUPABASE_URL/rest/v1/decisions_log" || echo "Warning: failed to log decision"

echo "Decision logged."
echo ""

# --- Post-cleanup summary ---
echo "=== Post-cleanup summary ==="
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" "$API/ops/tasks" -o "$TMP_DIR/tasks_after.json"
python3 << PYEOF
import json
from collections import Counter
tasks = json.load(open("$TMP_DIR/tasks_after.json")).get("data", [])
counts = Counter(t["status"] for t in tasks)
print(f"Total: {len(tasks)}")
for s, c in sorted(counts.items()):
    print(f"  {s}: {c}")
print()
print("Remaining non-done tasks:")
for t in sorted(tasks, key=lambda x: (x.get("phase",0), x.get("id",""))):
    if t["status"] != "done":
        sid = t["status"]
        phase = t.get("phase", 0)
        tid = t["id"]
        title = t.get("title","")[:70]
        print(f"  [{sid:>8}] phase={phase} {tid}: {title}")
PYEOF

echo ""
echo "=== Backlog cleanup complete ==="
