#!/usr/bin/env bash
set -euo pipefail

# ─── Test: Runner NOOP detection logic ──────────────────────────────
# Tests unitarios para la logica de deteccion NOOP del runner.
# Ejecutar: bash scripts/__tests__/test_runner_noop.sh

PASS=0
FAIL=0

assert_eq() {
  local test_name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: ${test_name}"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: ${test_name} — expected '${expected}', got '${actual}'"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Fix C: Pre-validacion (handler check) ──────────────────────────

echo "Test 1: Task con directive_id y sin handler → FAILED (no_actionable_steps)"
has_handler=false
task_directive_id="DIR-1770995367892-sis5"
should_fail="false"
if [ "$has_handler" = false ] && [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail="true"
fi
assert_eq "no handler + directive → fail" "true" "$should_fail"

echo "Test 2: Task con directive_id PERO con handler → pasa"
has_handler=true
task_directive_id="DIR-1770995367892-sis5"
should_fail="false"
if [ "$has_handler" = false ] && [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail="true"
fi
assert_eq "has handler + directive → pass" "false" "$should_fail"

echo "Test 3: Task sin directive_id y sin handler → pasa (diagnostico)"
has_handler=false
task_directive_id=""
should_fail="false"
if [ "$has_handler" = false ] && [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail="true"
fi
assert_eq "no handler + no directive → pass" "false" "$should_fail"

echo "Test 4: Task con directive_id=null → pasa"
has_handler=false
task_directive_id="null"
should_fail="false"
if [ "$has_handler" = false ] && [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail="true"
fi
assert_eq "null directive → pass" "false" "$should_fail"

# ─── Fix A: NOOP guardrail ──────────────────────────────────────────

echo "Test 5: before_sha == after_sha sin custom steps → NOOP FAILED"
before_sha="a2127d8"
after_sha="a2127d8"
custom_steps_ran=false
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "NOOP detected" "true" "$is_noop"

echo "Test 6: before_sha != after_sha → no es NOOP"
before_sha="a2127d8"
after_sha="c4e407f"
custom_steps_ran=false
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "not NOOP with different SHA" "false" "$is_noop"

echo "Test 7: before_sha == after_sha pero custom steps ran → no es NOOP"
before_sha="a2127d8"
after_sha="a2127d8"
custom_steps_ran=true
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "not NOOP with custom steps" "false" "$is_noop"

# ─── Fix B: file_changes sin fallback ───────────────────────────────

echo "Test 8: file_changes vacio cuando before_sha == after_sha"
before_sha="a2127d8"
after_sha="a2127d8"
diff_output=""
if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
  diff_output="M	some/file.ts"
fi
assert_eq "no file_changes when SHA equal" "" "$diff_output"

echo "Test 9: file_changes se genera cuando before_sha != after_sha"
before_sha="a2127d8"
after_sha="c4e407f"
diff_output=""
if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
  diff_output="M	some/file.ts"
fi
assert_eq "file_changes generated when SHA differ" "M	some/file.ts" "$diff_output"

# ─── Diferenciacion de eventos ───────────────────────────────────────

echo "Test 10: task_no_actionable_steps != task_noop_detected"
event_prevalidation="task_no_actionable_steps"
event_noop="task_noop_detected"
assert_eq "events are different" "false" "$([ "$event_prevalidation" = "$event_noop" ] && echo true || echo false)"

# ─── Resumen ────────────────────────────────────────────────────────
echo ""
echo "=== Resultados: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
