#!/usr/bin/env bash
set -euo pipefail

# ─── gcp_runner_ctl.sh ─────────────────────────────────────────────
# Control del servicio elruso-runner via systemd.
#
# Uso:
#   ./scripts/gcp_runner_ctl.sh start
#   ./scripts/gcp_runner_ctl.sh stop
#   ./scripts/gcp_runner_ctl.sh restart
#   ./scripts/gcp_runner_ctl.sh status
#   ./scripts/gcp_runner_ctl.sh logs
#   ./scripts/gcp_runner_ctl.sh logs-follow

SERVICE_NAME="elruso-runner"

case "${1:-}" in
  start)
    echo "Arrancando $SERVICE_NAME..."
    sudo systemctl start "$SERVICE_NAME"
    sudo systemctl status "$SERVICE_NAME" --no-pager -l
    ;;
  stop)
    echo "Deteniendo $SERVICE_NAME..."
    sudo systemctl stop "$SERVICE_NAME"
    echo "Detenido."
    ;;
  restart)
    echo "Reiniciando $SERVICE_NAME..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 2
    sudo systemctl status "$SERVICE_NAME" --no-pager -l
    ;;
  status)
    sudo systemctl status "$SERVICE_NAME" --no-pager -l
    ;;
  logs)
    sudo journalctl -u "$SERVICE_NAME" -n 200 --no-pager
    ;;
  logs-follow)
    sudo journalctl -u "$SERVICE_NAME" -f
    ;;
  update)
    echo "Actualizando repo y reiniciando runner..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ROOT="$(dirname "$SCRIPT_DIR")"
    git -C "$ROOT" pull --ff-only
    cd "$ROOT" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    sudo systemctl restart "$SERVICE_NAME"
    sleep 2
    sudo systemctl status "$SERVICE_NAME" --no-pager -l
    ;;
  *)
    echo "Uso: $0 {start|stop|restart|status|logs|logs-follow|update}"
    echo ""
    echo "  start       Arranca el runner"
    echo "  stop        Detiene el runner"
    echo "  restart     Reinicia el runner"
    echo "  status      Muestra estado actual"
    echo "  logs        Ultimas 200 lineas de log"
    echo "  logs-follow Logs en tiempo real (Ctrl+C para salir)"
    echo "  update      Git pull + pnpm install + restart"
    exit 1
    ;;
esac
