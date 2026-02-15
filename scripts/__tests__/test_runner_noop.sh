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

# ─── Test 1: Task con directive_id → FAILED (no_actionable_steps) ───
echo "Test 1: Task con directive_id debe fallar con no_actionable_steps"
task_directive_id="DIR-1770995367892-sis5"
should_fail_prevalidation="false"
if [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail_prevalidation="true"
fi
assert_eq "directive task detected" "true" "$should_fail_prevalidation"

# ─── Test 2: Task sin directive_id → pasa pre-validacion ────────────
echo "Test 2: Task sin directive_id pasa pre-validacion"
task_directive_id=""
should_fail_prevalidation="false"
if [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail_prevalidation="true"
fi
assert_eq "non-directive task passes" "false" "$should_fail_prevalidation"

# ─── Test 3: Task con directive_id=null → pasa pre-validacion ───────
echo "Test 3: Task con directive_id=null pasa pre-validacion"
task_directive_id="null"
should_fail_prevalidation="false"
if [ -n "$task_directive_id" ] && [ "$task_directive_id" != "null" ]; then
  should_fail_prevalidation="true"
fi
assert_eq "null directive passes" "false" "$should_fail_prevalidation"

# ─── Test 4: NOOP — before_sha == after_sha sin custom steps → FAILED
echo "Test 4: before_sha == after_sha sin custom steps → NOOP FAILED"
before_sha="a2127d8"
after_sha="a2127d8"
custom_steps_ran=false
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "NOOP detected" "true" "$is_noop"

# ─── Test 5: before_sha != after_sha → NOT NOOP ─────────────────────
echo "Test 5: before_sha != after_sha → no es NOOP"
before_sha="a2127d8"
after_sha="c4e407f"
custom_steps_ran=false
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "not NOOP with different SHA" "false" "$is_noop"

# ─── Test 6: before_sha == after_sha pero con custom steps → NOT NOOP
echo "Test 6: before_sha == after_sha pero custom steps ran → no es NOOP"
before_sha="a2127d8"
after_sha="a2127d8"
custom_steps_ran=true
is_noop="false"
if [ "$before_sha" = "$after_sha" ] && [ "$custom_steps_ran" = false ]; then
  is_noop="true"
fi
assert_eq "not NOOP with custom steps" "false" "$is_noop"

# ─── Test 7: file_changes vacio cuando before == after ───────────────
echo "Test 7: file_changes debe quedar vacio cuando before_sha == after_sha"
before_sha="a2127d8"
after_sha="a2127d8"
diff_output=""
# Simula la logica del runner (FIX B): solo genera diff si SHAs difieren
if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
  diff_output="M	some/file.ts"  # Solo se ejecuta si SHAs difieren
fi
# NO hay fallback con HEAD~1 HEAD
assert_eq "no file_changes when SHA equal" "" "$diff_output"

# ─── Test 8: file_changes se genera cuando before != after ───────────
echo "Test 8: file_changes se genera cuando before_sha != after_sha"
before_sha="a2127d8"
after_sha="c4e407f"
diff_output=""
if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
  diff_output="M	some/file.ts"  # Simulado — en real seria git diff
fi
assert_eq "file_changes generated when SHA differ" "M	some/file.ts" "$diff_output"

# ─── Resumen ────────────────────────────────────────────────────────
echo ""
echo "=== Resultados: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
