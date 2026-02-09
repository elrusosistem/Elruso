#!/usr/bin/env bash
set -euo pipefail

# ─── runner_daemon.sh ────────────────────────────────────────────────
# Wrapper para correr runner_local.sh como daemon.
# Reinicia automaticamente si se cae. Logs a archivo.
#
# Uso:
#   ./scripts/runner_daemon.sh start     # Arranca en background
#   ./scripts/runner_daemon.sh stop      # Para el daemon
#   ./scripts/runner_daemon.sh status    # Muestra si esta corriendo
#   ./scripts/runner_daemon.sh logs      # Tail de logs
#
# Configurable via env vars:
#   API_BASE_URL  (default: https://elruso.onrender.com)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$ROOT/.tmp/runner.pid"
LOG_FILE="$ROOT/reports/runs/runner_daemon.log"

# Apuntar a prod por default
export API_BASE_URL="${API_BASE_URL:-https://elruso.onrender.com}"

# Asegurar directorios
mkdir -p "$(dirname "$PID_FILE")"
mkdir -p "$(dirname "$LOG_FILE")"

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    # PID stale, limpiar
    rm -f "$PID_FILE"
  fi
  return 1
}

do_start() {
  if is_running; then
    echo "Runner ya esta corriendo (PID $(cat "$PID_FILE"))"
    exit 0
  fi

  echo "Arrancando runner daemon..."
  echo "  API: $API_BASE_URL"
  echo "  Logs: $LOG_FILE"
  echo "  PID: $PID_FILE"

  # Loop con restart automatico
  (
    while true; do
      echo "" >> "$LOG_FILE"
      echo "=== Runner daemon iniciado: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG_FILE"
      echo "  API_BASE_URL=$API_BASE_URL" >> "$LOG_FILE"

      # Correr el runner en modo loop
      bash "$SCRIPT_DIR/runner_local.sh" --loop >> "$LOG_FILE" 2>&1 || true

      echo "=== Runner se detuvo: $(date -u +%Y-%m-%dT%H:%M:%SZ). Reiniciando en 5s... ===" >> "$LOG_FILE"
      sleep 5
    done
  ) &

  local daemon_pid=$!
  echo "$daemon_pid" > "$PID_FILE"
  echo "Runner daemon arrancado (PID $daemon_pid)"
}

do_stop() {
  if ! is_running; then
    echo "Runner no esta corriendo."
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  echo "Deteniendo runner daemon (PID $pid)..."

  # Matar el daemon y sus hijos
  kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Runner detenido."
}

do_status() {
  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo "Runner corriendo (PID $pid)"
    echo "  API: $API_BASE_URL"
    echo "  Logs: $LOG_FILE"
    # Ultima linea del log
    if [ -f "$LOG_FILE" ]; then
      echo "  Ultimo log: $(tail -1 "$LOG_FILE")"
    fi
  else
    echo "Runner NO esta corriendo."
  fi
}

do_logs() {
  if [ -f "$LOG_FILE" ]; then
    tail -50 "$LOG_FILE"
  else
    echo "No hay logs todavia."
  fi
}

case "${1:-}" in
  start)  do_start ;;
  stop)   do_stop ;;
  status) do_status ;;
  logs)   do_logs ;;
  *)
    echo "Uso: $0 {start|stop|status|logs}"
    echo ""
    echo "  start   Arranca el runner como daemon (background)"
    echo "  stop    Detiene el daemon"
    echo "  status  Muestra si esta corriendo"
    echo "  logs    Muestra ultimas 50 lineas del log"
    exit 1
    ;;
esac
