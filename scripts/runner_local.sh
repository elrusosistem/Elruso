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
  echo "ERROR: jq es requerido. Instalar: brew install jq"
  exit 1
fi

# ─── Helpers ─────────────────────────────────────────────────────────
log() { echo "[runner] $(date +%H:%M:%S) $*" >&2; }

send_heartbeat() {
  local now
  now=$(date +%s)
  # Solo enviar si pasaron >= HEARTBEAT_INTERVAL segundos
  if [ $((now - LAST_HEARTBEAT)) -lt "$HEARTBEAT_INTERVAL" ]; then
    return 0
  fi

  local meta
  meta="{\"hostname\":\"$(hostname)\",\"pid\":$$,\"api\":\"$API_BASE_URL\"}"

  api_post "/ops/runner/heartbeat" "{\"runner_id\":\"${RUNNER_ID}\",\"status\":\"online\",\"meta\":${meta}}" > /dev/null 2>&1 || log "  WARN: heartbeat failed"
  LAST_HEARTBEAT=$now
}

api_get() {
  curl -sf "${API_BASE_URL}${1}" 2>/dev/null
}

api_post() {
  curl -sf -X POST "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null
}

api_patch() {
  curl -sf -X PATCH "${API_BASE_URL}${1}" \
    -H "Content-Type: application/json" \
    -d "${2}" 2>/dev/null
}

# ─── Ejecutar un comando y registrar step ────────────────────────────
run_step() {
  local run_id="$1"
  local step_name="$2"
  local cmd="$3"

  log "  paso: ${step_name} -> ${cmd}"

  local output exit_code
  output=$(eval "$cmd" 2>&1) && exit_code=0 || exit_code=$?

  # Truncar output a 500 chars
  if [ ${#output} -gt 500 ]; then
    output="${output:0:500}..."
  fi

  # Escapar para JSON con jq
  local escaped_output
  escaped_output=$(echo "$output" | jq -Rs '.')

  api_post "/runs/${run_id}/steps" "{
    \"step_name\": \"${step_name}\",
    \"cmd\": $(echo "$cmd" | jq -Rs '.'),
    \"exit_code\": ${exit_code},
    \"output_excerpt\": ${escaped_output}
  }" > /dev/null || log "  WARN: no se pudo registrar step ${step_name}"

  echo "$exit_code"
}

# ─── Procesar una task ───────────────────────────────────────────────
process_task() {
  local task_id="$1"
  local task_title="$2"

  log "=== Procesando: ${task_id} — ${task_title} ==="

  # 1. Atomic claim
  local claim_response
  claim_response=$(api_post "/ops/tasks/claim" "{\"task_id\":\"${task_id}\",\"runner_id\":\"${RUNNER_ID}\"}") || claim_response=""

  if [ -z "$claim_response" ]; then
    log "  WARN: task no elegible o ya claimed, saltando"
    return 2
  fi

  local claim_ok
  claim_ok=$(echo "$claim_response" | jq -r '.ok // false')
  if [ "$claim_ok" != "true" ]; then
    log "  WARN: task no elegible o ya claimed (409), saltando"
    return 2
  fi

  log "  task claimed (runner: ${RUNNER_ID})"

  # 2. Obtener info git
  local branch commit_hash
  branch=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
  commit_hash=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")

  # 3. Crear RUN via API
  local run_response run_id
  run_response=$(api_post "/runs" "{
    \"task_id\": \"${task_id}\",
    \"branch\": \"${branch}\",
    \"commit_hash\": \"${commit_hash}\"
  }") || run_response=""

  if [ -z "$run_response" ]; then
    log "  ERROR: no se pudo crear run (API no respondio)"
    api_patch "/ops/tasks/${task_id}" '{"status":"failed"}' > /dev/null || true
    return 1
  fi

  run_id=$(echo "$run_response" | jq -r '.data.id // empty')

  if [ -z "$run_id" ]; then
    log "  ERROR: no se pudo crear run. Respuesta: ${run_response}"
    api_patch "/ops/tasks/${task_id}" '{"status":"failed"}' > /dev/null || true
    return 1
  fi

  log "  run creado: ${run_id}"

  # 4. Ejecutar steps
  local all_ok=true
  local ec

  ec=$(run_step "$run_id" "version-node" "node -v")
  [ "$ec" -ne 0 ] && all_ok=false

  ec=$(run_step "$run_id" "version-pnpm" "pnpm -v")
  [ "$ec" -ne 0 ] && all_ok=false

  ec=$(run_step "$run_id" "git-head" "git -C ${ROOT} rev-parse --short HEAD")
  [ "$ec" -ne 0 ] && all_ok=false

  # 5. Capturar file_changes via git
  local file_changes_json="[]"
  local diff_output
  diff_output=$(git -C "$ROOT" diff --name-status HEAD~1 HEAD 2>/dev/null || echo "")

  if [ -n "$diff_output" ]; then
    local fc_tmp=""
    while IFS=$'\t' read -r fc_status fc_path fc_rest; do
      local fc_type="modified"
      case "$fc_status" in
        A*) fc_type="added" ;;
        D*) fc_type="deleted" ;;
        R*) fc_type="renamed"; fc_path="${fc_rest}" ;;
        M*) fc_type="modified" ;;
      esac
      fc_tmp="${fc_tmp}{\"path\":\"${fc_path}\",\"change_type\":\"${fc_type}\"},"
    done <<< "$diff_output"
    # Quitar ultima coma y envolver en array
    fc_tmp="${fc_tmp%,}"
    file_changes_json="[${fc_tmp}]"
  fi

  # Guardar patch redactado en reports/runs/<run_id>/
  local patch_dir="${ROOT}/reports/runs/${run_id}"
  local patch_path=""
  mkdir -p "$patch_dir"
  local raw_patch
  raw_patch=$(git -C "$ROOT" diff HEAD~1 HEAD 2>/dev/null || echo "")
  if [ -n "$raw_patch" ]; then
    # Redactar patrones de secretos del patch
    local redacted_patch
    redacted_patch=$(echo "$raw_patch" | sed -E \
      -e 's/sk-[A-Za-z0-9_-]{20,}/sk-***REDACTED***/g' \
      -e 's/rnd_[A-Za-z0-9_-]{20,}/rnd_***REDACTED***/g' \
      -e 's/eyJ[A-Za-z0-9_-]{40,}/***JWT_REDACTED***/g' \
      -e 's/Authorization: Bearer [^ ]*/Authorization: Bearer ***REDACTED***/g' \
      -e 's/apikey: [^ ]*/apikey: ***REDACTED***/g')
    echo "$redacted_patch" > "${patch_dir}/patch_redacted.diff"
    patch_path="reports/runs/${run_id}/patch_redacted.diff"
    log "  patch guardado: ${patch_path}"
  fi

  # Guardar diffstat
  local diffstat
  diffstat=$(git -C "$ROOT" diff --stat HEAD~1 HEAD 2>/dev/null || echo "sin cambios")
  echo "$diffstat" > "${patch_dir}/diffstat.txt"

  # 6. Finalizar RUN
  local final_status="done"
  if [ "$all_ok" = false ]; then
    final_status="failed"
  fi

  local file_count
  file_count=$(echo "$file_changes_json" | jq 'length')

  local summary="Task ${task_id} ejecutada por runner_local. Steps: 3. File changes: ${file_count}. Status: ${final_status}. Branch: ${branch}. Commit: ${commit_hash}."
  local escaped_summary
  escaped_summary=$(echo "$summary" | jq -Rs '.')

  api_patch "/runs/${run_id}" "{
    \"status\": \"${final_status}\",
    \"summary\": ${escaped_summary},
    \"file_changes\": ${file_changes_json}
  }" > /dev/null || log "  WARN: no se pudo finalizar run"

  log "  run -> ${final_status} (${file_count} file_changes)"

  # 6. Marcar task segun resultado
  if [ "$final_status" = "done" ]; then
    api_patch "/ops/tasks/${task_id}" "{\"status\":\"done\",\"finished_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null || true
    log "  task -> done"
  else
    # Obtener attempts actuales
    local task_info attempts max_attempts
    task_info=$(api_get "/ops/tasks?status=running" | jq -r ".data[] | select(.id==\"${task_id}\")") || task_info=""
    attempts=$(echo "$task_info" | jq -r '.attempts // 0')
    max_attempts=$(echo "$task_info" | jq -r '.max_attempts // 3')
    attempts=$((attempts + 1))

    if [ "$attempts" -lt "$max_attempts" ]; then
      # Retry con backoff exponencial: 10s, 30s, 120s
      local backoff=10
      if [ "$attempts" -eq 2 ]; then backoff=30; fi
      if [ "$attempts" -ge 3 ]; then backoff=120; fi

      local next_run
      next_run=$(date -u -v+${backoff}S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "+${backoff} seconds" +%Y-%m-%dT%H:%M:%SZ)

      api_patch "/ops/tasks/${task_id}" "{\"status\":\"ready\",\"attempts\":${attempts},\"next_run_at\":\"${next_run}\",\"last_error\":\"steps failed (${attempts}/${max_attempts})\"}" > /dev/null || true
      log "  task -> retry ${attempts}/${max_attempts} (next_run: +${backoff}s)"
    else
      # Hard-stop: blocked + finished_at
      local finished_at
      finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      api_patch "/ops/tasks/${task_id}" "{\"status\":\"blocked\",\"attempts\":${attempts},\"finished_at\":\"${finished_at}\",\"last_error\":\"max_attempts_reached (${attempts}/${max_attempts})\"}" > /dev/null || true
      log "  task -> blocked (max attempts reached, hard-stop)"
    fi
  fi

  log "=== Fin: ${task_id} ==="
  return 0
}

# ─── Anti-stuck sweep ────────────────────────────────────────────────
sweep_stuck_tasks() {
  log "Sweep: buscando tasks colgadas..."
  local tasks_response stuck_tasks
  tasks_response=$(api_get "/ops/tasks?status=running") || tasks_response=""

  if [ -z "$tasks_response" ]; then
    log "  WARN: no se pudo consultar running tasks"
    return 1
  fi

  stuck_tasks=$(echo "$tasks_response" | jq -r --arg threshold "$STUCK_THRESHOLD_SECONDS" '
    .data[] | select(.started_at != null) |
    select((now - (.started_at | fromdateiso8601)) > ($threshold | tonumber)) |
    select((.attempts // 0) < (.max_attempts // 3)) |
    .id
  ')

  if [ -z "$stuck_tasks" ]; then
    log "  Sweep: no hay tasks colgadas"
    return 0
  fi

  while read -r stuck_id; do
    if [ -n "$stuck_id" ]; then
      log "  Sweep: requeue ${stuck_id} (timeout)"
      api_post "/ops/tasks/${stuck_id}/requeue" '{"backoff_seconds":30}' > /dev/null || true
    fi
  done <<< "$stuck_tasks"
}

# ─── Main ────────────────────────────────────────────────────────────
run_once() {
  # Heartbeat
  send_heartbeat

  # Buscar primera task READY
  local tasks_response
  tasks_response=$(api_get "/ops/tasks?status=ready") || tasks_response=""

  if [ -z "$tasks_response" ]; then
    log "ERROR: no se pudo consultar tasks. API disponible en ${API_BASE_URL}?"
    return 1
  fi

  local ok
  ok=$(echo "$tasks_response" | jq -r '.ok')

  if [ "$ok" != "true" ]; then
    log "ERROR: API respondio con error: $(echo "$tasks_response" | jq -r '.error // "desconocido"')"
    return 1
  fi

  # Extraer primera task
  local task_id task_title
  task_id=$(echo "$tasks_response" | jq -r '.data[0].id // empty')
  task_title=$(echo "$tasks_response" | jq -r '.data[0].title // empty')

  if [ -z "$task_id" ]; then
    log "No hay tasks READY."
    return 2
  fi

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
      exit_code=$?
      if [ "$exit_code" -eq 2 ]; then
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
