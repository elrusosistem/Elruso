#!/usr/bin/env bash
set -euo pipefail

# ─── runner_local.sh ─────────────────────────────────────────────────
# Runner local minimo: consume tasks READY, ejecuta, registra runs via API.
# Sin LLM todavia — ejecuta comandos de diagnostico y registra resultado.
#
# Uso:
#   ./scripts/runner_local.sh              # Una sola iteracion
#   ./scripts/runner_local.sh --loop       # Loop cada 10s con backoff
#
# Requiere: API corriendo (local o remota), jq, curl.
# Configurable via API_BASE_URL.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Config ──────────────────────────────────────────────────────────
API_BASE_URL="${API_BASE_URL:-http://localhost:3001}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
LOOP_MODE=false
POLL_INTERVAL=10
MAX_BACKOFF=120
HEARTBEAT_INTERVAL=15
STUCK_THRESHOLD_SECONDS=900  # 15 min
RUNNER_ID="${RUNNER_ID:-runner-$(hostname)-$$}"

# Tracking de ultimo heartbeat
LAST_HEARTBEAT=0

if [ "${1:-}" = "--loop" ]; then
  LOOP_MODE=true
fi

# ─── Validaciones ────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq es requerido. Instalar: sudo apt install -y jq"
  exit 1
fi

# ─── Helpers ─────────────────────────────────────────────────────────
log() { echo "[runner] $(date +%H:%M:%S) $*" >&2; }

send_heartbeat() {
  local now=""
  now=$(date +%s)
  # Solo enviar si pasaron >= HEARTBEAT_INTERVAL segundos
  if [ $((now - LAST_HEARTBEAT)) -lt "$HEARTBEAT_INTERVAL" ]; then
    return 0
  fi

  local meta=""
  meta="{\"hostname\":\"$(hostname)\",\"pid\":$$,\"api\":\"$API_BASE_URL\"}"

  api_post "/ops/runner/heartbeat" "{\"runner_id\":\"${RUNNER_ID}\",\"status\":\"online\",\"meta\":${meta}}" > /dev/null 2>&1 || log "  WARN: heartbeat failed"
  LAST_HEARTBEAT=$now
}

AUTH_ARGS=()
if [ -n "$ADMIN_TOKEN" ]; then
  AUTH_ARGS=(-H "Authorization: Bearer ${ADMIN_TOKEN}")
fi

api_get() {
  curl -sf "${AUTH_ARGS[@]}" "${API_BASE_URL}${1}" 2>/dev/null || true
}

api_post() {
  curl -sf -X POST "${AUTH_ARGS[@]}" "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null || true
}

api_patch() {
  curl -sf -X PATCH "${AUTH_ARGS[@]}" "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null || true
}

# ─── Ejecutar un comando y registrar step ────────────────────────────
run_step() {
  local run_id="$1"
  local step_name="$2"
  local cmd="$3"

  log "  paso: ${step_name} -> ${cmd}"

  local output="" exit_code=0
  output=$(eval "$cmd" 2>&1) && exit_code=0 || exit_code=$?

  # Truncar output a 500 chars
  if [ ${#output} -gt 500 ]; then
    output="${output:0:500}..."
  fi

  # Escapar para JSON con jq
  local escaped_output=""
  escaped_output=$(echo "$output" | jq -Rs '.' 2>/dev/null || echo '""')

  api_post "/runs/${run_id}/steps" "{
    \"step_name\": \"${step_name}\",
    \"cmd\": $(echo "$cmd" | jq -Rs '.' 2>/dev/null || echo '""'),
    \"exit_code\": ${exit_code},
    \"output_excerpt\": ${escaped_output}
  }" > /dev/null 2>&1 || log "  WARN: no se pudo registrar step ${step_name}"

  echo "$exit_code"
}

# ─── Procesar una task ya claimed ────────────────────────────────────
process_task() {
  local task_id="$1"
  local task_title="$2"

  log "=== Procesando: ${task_id} — ${task_title} ==="

  # 1. Capturar BEFORE_SHA
  local branch="" before_sha=""
  branch=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
  before_sha=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  # 2. Crear RUN via API
  local run_response="" run_id=""
  run_response=$(api_post "/runs" "{
    \"task_id\": \"${task_id}\",
    \"branch\": \"${branch}\",
    \"commit_hash\": \"${before_sha}\"
  }")

  run_id=$(echo "$run_response" | jq -r '.data.id // empty' 2>/dev/null || echo "")

  if [ -z "$run_id" ]; then
    log "  ERROR: no se pudo crear run"
    requeue_task "$task_id" "failed to create run"
    return 1
  fi

  log "  run creado: ${run_id} (before_sha: ${before_sha})"

  # 3. Ejecutar steps
  local all_ok=true
  local ec=""

  ec=$(run_step "$run_id" "version-node" "node -v")
  [ "$ec" -ne 0 ] 2>/dev/null && all_ok=false

  ec=$(run_step "$run_id" "version-pnpm" "pnpm -v")
  [ "$ec" -ne 0 ] 2>/dev/null && all_ok=false

  ec=$(run_step "$run_id" "git-head" "git -C ${ROOT} rev-parse --short HEAD")
  [ "$ec" -ne 0 ] 2>/dev/null && all_ok=false

  # 4. Capturar AFTER_SHA
  local after_sha=""
  after_sha=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  log "  after_sha: ${after_sha}"

  # 5. Generar file_changes via git diff
  local file_changes_json="[]"
  local diff_output=""

  if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
    diff_output=$(git -C "$ROOT" diff --name-status "${before_sha}" "${after_sha}" 2>/dev/null || echo "")
  else
    diff_output=$(git -C "$ROOT" diff --name-status HEAD~1 HEAD 2>/dev/null || echo "")
  fi

  if [ -n "$diff_output" ]; then
    local fc_tmp=""
    while IFS=$'\t' read -r fc_status fc_path fc_rest; do
      local fc_type="modified"
      case "${fc_status:-}" in
        A*) fc_type="added" ;;
        D*) fc_type="deleted" ;;
        R*) fc_type="renamed"; fc_path="${fc_rest:-$fc_path}" ;;
        M*) fc_type="modified" ;;
      esac
      fc_tmp="${fc_tmp}{\"path\":\"${fc_path}\",\"change_type\":\"${fc_type}\"},"
    done <<< "$diff_output"
    fc_tmp="${fc_tmp%,}"
    file_changes_json="[${fc_tmp}]"
  fi

  # 6. Generar diffstat + patch + redaccion forense
  local diffstat="" raw_patch="" redacted_patch="" patch_dir=""
  patch_dir="${ROOT}/reports/runs/${run_id}"
  mkdir -p "$patch_dir" 2>/dev/null || true

  if [ "$before_sha" != "unknown" ] && [ "$after_sha" != "unknown" ] && [ "$before_sha" != "$after_sha" ]; then
    diffstat=$(git -C "$ROOT" diff --stat "${before_sha}" "${after_sha}" 2>/dev/null || echo "0 files changed")
    raw_patch=$(git -C "$ROOT" diff "${before_sha}" "${after_sha}" 2>/dev/null || echo "")
  else
    diffstat=$(git -C "$ROOT" diff --stat HEAD~1 HEAD 2>/dev/null || echo "0 files changed")
    raw_patch=$(git -C "$ROOT" diff HEAD~1 HEAD 2>/dev/null || echo "")
  fi

  if [ -n "$raw_patch" ]; then
    if command -v node &>/dev/null && [ -f "${ROOT}/scripts/redact_patch.mjs" ]; then
      redacted_patch=$(echo "$raw_patch" | node "${ROOT}/scripts/redact_patch.mjs" 2>/dev/null)
      local redact_exit=$?
      if [ $redact_exit -ne 0 ]; then
        log "  ERROR: redact_patch.mjs fallo (exit ${redact_exit}). Patch NO guardado"
        redacted_patch=""
      fi
    else
      log "  WARN: node o redact_patch.mjs no disponible. Patch NO guardado"
      redacted_patch=""
    fi
  else
    redacted_patch=""
    log "  sin cambios de codigo (patch vacio)"
  fi

  echo "$diffstat" > "${patch_dir}/diffstat.txt"
  if [ -n "$redacted_patch" ]; then
    echo "$redacted_patch" > "${patch_dir}/patch_redacted.diff"
    log "  patch guardado local: reports/runs/${run_id}/"
  fi

  # 7. Upload artifacts via API
  local escaped_diffstat="" escaped_patch=""
  escaped_diffstat=$(echo "$diffstat" | jq -Rs '.' 2>/dev/null || echo '""')
  if [ -n "$redacted_patch" ]; then
    escaped_patch=$(echo "$redacted_patch" | jq -Rs '.' 2>/dev/null || echo '""')
  else
    escaped_patch='""'
  fi

  api_post "/runs/${run_id}/artifacts" "{
    \"diffstat\": ${escaped_diffstat},
    \"patch_redacted\": ${escaped_patch},
    \"before_sha\": \"${before_sha}\",
    \"after_sha\": \"${after_sha}\"
  }" > /dev/null 2>&1 || log "  WARN: no se pudieron subir artifacts"

  # 8. Finalizar RUN
  local final_status="done"
  if [ "$all_ok" = false ]; then
    final_status="failed"
  fi

  local file_count=0
  file_count=$(echo "$file_changes_json" | jq 'length' 2>/dev/null || echo "0")

  local summary="Task ${task_id}. Steps: 3. Files: ${file_count}. Status: ${final_status}. SHA: ${before_sha}..${after_sha}."
  local escaped_summary=""
  escaped_summary=$(echo "$summary" | jq -Rs '.' 2>/dev/null || echo '""')

  api_patch "/runs/${run_id}" "{
    \"status\": \"${final_status}\",
    \"summary\": ${escaped_summary},
    \"file_changes\": ${file_changes_json}
  }" > /dev/null 2>&1 || log "  WARN: no se pudo finalizar run"

  log "  run -> ${final_status} (${file_count} files, diffstat: $(echo "$diffstat" | tail -1))"

  # 9. Marcar task segun resultado
  if [ "$final_status" = "done" ]; then
    api_patch "/ops/tasks/${task_id}" "{\"status\":\"done\",\"finished_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null 2>&1 || true
    log "  task -> done"
  else
    # Requeue con backoff escalonado via API (30/60/120)
    local attempt_num=""
    attempt_num=$(echo "$run_response" | jq -r '.data.attempts // 0' 2>/dev/null || echo "0")
    # Backoff: 30s base, doubles per attempt
    local backoff=30
    if [ "$attempt_num" -ge 1 ] 2>/dev/null; then backoff=60; fi
    if [ "$attempt_num" -ge 2 ] 2>/dev/null; then backoff=120; fi

    requeue_task "$task_id" "steps failed (exit_code=${ec})" "$backoff"
  fi

  log "=== Fin: ${task_id} ==="
  return 0
}

# ─── Requeue via API ────────────────────────────────────────────────
requeue_task() {
  local task_id="$1"
  local error_msg="${2:-unknown error}"
  local backoff="${3:-30}"

  # Redactar error (quitar posibles secrets)
  local safe_error=""
  safe_error=$(echo "$error_msg" | head -c 200)

  local escaped_error=""
  escaped_error=$(echo "$safe_error" | jq -Rs '.' 2>/dev/null || echo '"unknown"')

  local requeue_response=""
  requeue_response=$(api_post "/ops/tasks/${task_id}/requeue" "{\"backoff_seconds\":${backoff},\"last_error\":${escaped_error}}")

  local requeue_ok=""
  requeue_ok=$(echo "$requeue_response" | jq -r '.ok // false' 2>/dev/null || echo "false")

  if [ "$requeue_ok" = "true" ]; then
    local new_status=""
    new_status=$(echo "$requeue_response" | jq -r '.data.status // "?"' 2>/dev/null || echo "?")
    if [ "$new_status" = "blocked" ]; then
      log "  task -> BLOCKED (max attempts reached)"
    else
      local new_attempts=""
      new_attempts=$(echo "$requeue_response" | jq -r '.data.attempts // "?"' 2>/dev/null || echo "?")
      log "  task -> requeued (attempt ${new_attempts}, backoff ${backoff}s)"
    fi
  else
    log "  WARN: requeue failed, marking task failed"
    api_patch "/ops/tasks/${task_id}" "{\"status\":\"failed\",\"last_error\":${escaped_error}}" > /dev/null 2>&1 || true
  fi
}

# ─── Anti-stuck sweep ────────────────────────────────────────────────
sweep_stuck_tasks() {
  log "Sweep: buscando tasks colgadas..."

  local tasks_response=""
  local stuck_tasks=""

  tasks_response="$(api_get "/ops/tasks?status=running" 2>/dev/null || true)"

  if [ -z "$tasks_response" ]; then
    log "  WARN: no se pudo consultar running tasks"
    return 0
  fi

  stuck_tasks="$(
    echo "$tasks_response" | jq -r --arg threshold "$STUCK_THRESHOLD_SECONDS" '
      .data[]
      | select(.started_at != null)
      | .started_at_norm = (
          .started_at
          | sub("\\+00:00$";"Z")
          | sub("\\.[0-9]+\\+00:00$";"Z")
          | sub("\\.[0-9]+Z$";"Z")
        )
      | select((now - (.started_at_norm | fromdateiso8601)) > ($threshold | tonumber))
      | select((.attempts // 0) < (.max_attempts // 3))
      | .id
    ' 2>/dev/null || true
  )"

  if [ -z "$stuck_tasks" ]; then
    log "  Sweep: no hay tasks colgadas"
    return 0
  fi

  while IFS= read -r stuck_id; do
    [ -z "$stuck_id" ] && continue
    log "  Sweep: requeue ${stuck_id} (timeout)"
    api_post "/ops/tasks/${stuck_id}/requeue" '{"backoff_seconds":30}' > /dev/null 2>&1 || true
  done <<< "$stuck_tasks"
}

# ─── Main ────────────────────────────────────────────────────────────
run_once() {
  # Heartbeat
  send_heartbeat

  # Claim via server-side selection (no GET previo)
  local claim_response=""
  claim_response=$(api_post "/ops/tasks/claim" "{\"runner_id\":\"${RUNNER_ID}\"}")

  if [ -z "$claim_response" ]; then
    log "WARN: API no respondio. Disponible en ${API_BASE_URL}?"
    return 1
  fi

  local claim_ok=""
  claim_ok=$(echo "$claim_response" | jq -r '.ok // false' 2>/dev/null || echo "false")

  if [ "$claim_ok" != "true" ]; then
    local claim_error=""
    claim_error=$(echo "$claim_response" | jq -r '.error // "desconocido"' 2>/dev/null || echo "desconocido")
    if [ "$claim_error" = "system_paused" ]; then
      log "Sistema PAUSADO. Esperando..."
    else
      log "WARN: claim error: $claim_error"
    fi
    return 1
  fi

  # Server devuelve null si no hay task elegible
  local task_id="" task_title=""
  task_id=$(echo "$claim_response" | jq -r '.data.id // empty' 2>/dev/null || echo "")

  if [ -z "$task_id" ]; then
    log "Sin tasks elegibles."
    return 2
  fi

  task_title=$(echo "$claim_response" | jq -r '.data.title // empty' 2>/dev/null || echo "")
  log "Claimed: ${task_id} — ${task_title}"

  process_task "$task_id" "$task_title"
}

if [ "$LOOP_MODE" = true ]; then
  log "Modo loop. Polling cada ${POLL_INTERVAL}s. Ctrl+C para salir."
  log "Runner ID: ${RUNNER_ID}"
  current_interval=$POLL_INTERVAL
  loop_count=0
  while true; do
    # Sweep cada 10 iteraciones (~100s con POLL_INTERVAL=10)
    if [ $((loop_count % 10)) -eq 0 ]; then
      sweep_stuck_tasks
    fi

    if run_once; then
      current_interval=$POLL_INTERVAL  # Reset backoff on success
    else
      local_exit=$?
      if [ "$local_exit" -eq 2 ]; then
        # No hay tasks, backoff
        current_interval=$((current_interval * 2))
        [ "$current_interval" -gt "$MAX_BACKOFF" ] && current_interval=$MAX_BACKOFF
        log "Sin tasks. Backoff: ${current_interval}s"
      fi
    fi

    loop_count=$((loop_count + 1))
    sleep "$current_interval"
  done
else
  send_heartbeat
  run_once
fi
