#!/usr/bin/env bash
# ─── verify_project_isolation.sh ──────────────────────────────────────
# Smoke test: verifica que dos proyectos no pueden ver datos del otro.
# Usa la API REST directamente. No modifica datos reales.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
TOKEN="${ADMIN_TOKEN:-}"
AUTH_HEADER=""
[ -n "$TOKEN" ] && AUTH_HEADER="Authorization: Bearer $TOKEN"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
PASS=0
FAIL=0

log_pass() { echo -e "${GREEN}  PASS${NC} $1"; PASS=$((PASS + 1)); }
log_fail() { echo -e "${RED}  FAIL${NC} $1"; FAIL=$((FAIL + 1)); }

api() {
  local method="$1" url="$2" project_id="$3"
  shift 3
  local data="${1:-}"

  local args=(-s -X "$method" "${API_BASE}${url}" -H "Content-Type: application/json" -H "X-Project-Id: ${project_id}")
  [ -n "$AUTH_HEADER" ] && args+=(-H "$AUTH_HEADER")
  [ -n "$data" ] && args+=(-d "$data")

  curl "${args[@]}" 2>/dev/null
}

echo "=== Verificacion de aislamiento por project_id ==="
echo "API: $API_BASE"
echo ""

# ─── 1. Crear dos proyectos ────────────────────────────────────────────
echo "--- Creando proyectos de test ---"

RES_A=$(api POST /ops/projects "" '{"name":"IsolationTestA","profile":"generic"}')
PROJECT_A=$(echo "$RES_A" | jq -r '.data.id // empty')
if [ -z "$PROJECT_A" ]; then
  echo "ERROR: no se pudo crear proyecto A: $RES_A"
  exit 1
fi
echo "  Proyecto A: $PROJECT_A"

RES_B=$(api POST /ops/projects "" '{"name":"IsolationTestB","profile":"generic"}')
PROJECT_B=$(echo "$RES_B" | jq -r '.data.id // empty')
if [ -z "$PROJECT_B" ]; then
  echo "ERROR: no se pudo crear proyecto B: $RES_B"
  exit 1
fi
echo "  Proyecto B: $PROJECT_B"

# ─── 2. Crear task en proyecto A ───────────────────────────────────────
echo ""
echo "--- Creando task en proyecto A ---"

TASK_RES=$(api POST /ops/tasks "$PROJECT_A" "{\"id\":\"ISOLATION-TEST-TASK\",\"title\":\"Test isolation\",\"task_type\":\"feature\",\"steps\":[\"step1\"],\"status\":\"ready\",\"phase\":0,\"priority\":1}")
TASK_OK=$(echo "$TASK_RES" | jq -r '.ok // false')
if [ "$TASK_OK" = "true" ]; then
  log_pass "Task creada en proyecto A"
else
  log_fail "No se pudo crear task en proyecto A: $TASK_RES"
fi

# ─── 3. Leer task desde proyecto A → debe encontrarla ─────────────────
echo ""
echo "--- Leyendo tasks desde proyecto A ---"

TASKS_A=$(api GET /ops/tasks "$PROJECT_A")
COUNT_A=$(echo "$TASKS_A" | jq '[.data[]? | select(.id == "ISOLATION-TEST-TASK")] | length')
if [ "$COUNT_A" -ge 1 ]; then
  log_pass "Task visible desde proyecto A (count=$COUNT_A)"
else
  log_fail "Task NO visible desde proyecto A"
fi

# ─── 4. Leer task desde proyecto B → NO debe encontrarla ──────────────
echo ""
echo "--- Leyendo tasks desde proyecto B (debe ser vacio) ---"

TASKS_B=$(api GET /ops/tasks "$PROJECT_B")
COUNT_B=$(echo "$TASKS_B" | jq '[.data[]? | select(.id == "ISOLATION-TEST-TASK")] | length')
if [ "$COUNT_B" -eq 0 ]; then
  log_pass "Task NO visible desde proyecto B (aislamiento OK)"
else
  log_fail "Task VISIBLE desde proyecto B (aislamiento ROTO, count=$COUNT_B)"
fi

# ─── 5. Intentar PATCH task desde proyecto B → debe fallar ────────────
echo ""
echo "--- Intentando PATCH task desde proyecto B ---"

PATCH_RES=$(api PATCH /ops/tasks/ISOLATION-TEST-TASK "$PROJECT_B" '{"status":"done"}')
PATCH_OK=$(echo "$PATCH_RES" | jq -r '.ok // false')
if [ "$PATCH_OK" = "false" ] || [ "$(echo "$PATCH_RES" | jq -r '.data // empty')" = "" ]; then
  log_pass "PATCH desde proyecto B rechazado/sin efecto"
else
  log_fail "PATCH desde proyecto B tuvo efecto (aislamiento ROTO)"
fi

# ─── 6. Verificar que la task original sigue intacta ──────────────────
echo ""
echo "--- Verificando task original en proyecto A ---"

TASKS_A2=$(api GET /ops/tasks "$PROJECT_A")
STATUS_A=$(echo "$TASKS_A2" | jq -r '[.data[]? | select(.id == "ISOLATION-TEST-TASK")][0].status // "unknown"')
if [ "$STATUS_A" = "ready" ]; then
  log_pass "Task en proyecto A sigue intacta (status=ready)"
else
  log_fail "Task en proyecto A fue modificada (status=$STATUS_A)"
fi

# ─── Cleanup ──────────────────────────────────────────────────────────
echo ""
echo "--- Limpieza ---"

# Delete test task from project A
api PATCH /ops/tasks/ISOLATION-TEST-TASK "$PROJECT_A" '{"status":"done"}' > /dev/null 2>&1 || true
echo "  Test task marcada como done"

# ─── Resultado ────────────────────────────────────────────────────────
echo ""
echo "==================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "==================================="

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}AISLAMIENTO INCOMPLETO${NC}"
  exit 1
else
  echo -e "${GREEN}AISLAMIENTO VERIFICADO${NC}"
  exit 0
fi
