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

  # 1. Marcar task como RUNNING
  api_patch "/ops/tasks/${task_id}" '{"status":"running"}' > /dev/null || true
  log "  task -> running"

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
    file_changes_json=$(echo "$diff_output" | while IFS=$'\t' read -r status path rest; do
      local change_type="modified"
      case "$status" in
        A*) change_type="added" ;;
        D*) change_type="deleted" ;;
        R*) change_type="renamed"; path="${rest}" ;;
        M*) change_type="modified" ;;
      esac
      echo "{\"path\":\"${path}\",\"change_type\":\"${change_type}\"}"
    done | jq -sc '.')
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
    api_patch "/ops/tasks/${task_id}" '{"status":"done"}' > /dev/null || true
    log "  task -> done"
  else
    api_patch "/ops/tasks/${task_id}" '{"status":"failed"}' > /dev/null || true
    log "  task -> failed"
  fi

  log "=== Fin: ${task_id} ==="
  return 0
}

# ─── Main ────────────────────────────────────────────────────────────
run_once() {
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
  current_interval=$POLL_INTERVAL
  while true; do
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
    sleep "$current_interval"
  done
else
  run_once
fi
