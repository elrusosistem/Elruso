#!/usr/bin/env bash
set -euo pipefail

# ─── gcp_runner_install.sh ──────────────────────────────────────────
# Instala el runner de Elruso como servicio systemd en una VM Ubuntu.
# Ejecutar con sudo o como root.
#
# Uso:
#   sudo bash scripts/gcp_runner_install.sh
#
# Prerrequisitos:
#   - Ubuntu 22.04+ (o cualquier distro con systemd + apt)
#   - Acceso a internet
#   - El repo ya clonado (o se clona automaticamente)
#
# NO hardcodea paths ni usernames — usa $SUDO_USER / $USER y $HOME.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Detectar usuario real (no root) ──────────────────────────────
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")

echo "=== Elruso Runner — Instalacion ==="
echo "  Usuario: $REAL_USER"
echo "  Home:    $REAL_HOME"
echo ""

# ─── 1. Instalar dependencias ─────────────────────────────────────
echo "[1/6] Instalando dependencias del sistema..."

# Actualizar apt
apt-get update -qq

# jq + curl + git (si faltan)
apt-get install -y -qq curl git jq > /dev/null

# Node 22 LTS via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  echo "  Instalando Node 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
fi

# pnpm
if ! command -v pnpm &>/dev/null; then
  echo "  Instalando pnpm..."
  npm install -g pnpm > /dev/null 2>&1
fi

echo "  node $(node -v), pnpm $(pnpm -v), git $(git --version | awk '{print $3}')"

# ─── 2. Clonar o actualizar repo ──────────────────────────────────
REPO_DIR="$REAL_HOME/Elruso"
REPO_URL="https://github.com/elrusosistem/Elruso.git"

echo ""
echo "[2/6] Preparando repositorio..."

if [ -d "$REPO_DIR/.git" ]; then
  echo "  Repo existe en $REPO_DIR — actualizando..."
  sudo -u "$REAL_USER" git -C "$REPO_DIR" pull --ff-only || {
    echo "  WARN: git pull falló. Continuando con version actual."
  }
else
  echo "  Clonando $REPO_URL..."
  sudo -u "$REAL_USER" git clone "$REPO_URL" "$REPO_DIR"
fi

# ─── 3. Instalar dependencias del proyecto ─────────────────────────
echo ""
echo "[3/6] Instalando dependencias del proyecto..."
cd "$REPO_DIR"
sudo -u "$REAL_USER" pnpm install --frozen-lockfile 2>/dev/null || sudo -u "$REAL_USER" pnpm install

# ─── 4. Verificar archivo de env ──────────────────────────────────
ENV_FILE="$REPO_DIR/ops/.secrets/runner.env"

echo ""
echo "[4/6] Verificando configuracion..."

if [ ! -f "$ENV_FILE" ]; then
  echo "  Creando $ENV_FILE con valores por defecto..."
  sudo -u "$REAL_USER" mkdir -p "$(dirname "$ENV_FILE")"
  sudo -u "$REAL_USER" tee "$ENV_FILE" > /dev/null <<'ENVEOF'
# Elruso Runner — Variables de entorno
# Este archivo NO se commitea a git (esta en .gitignore)
API_BASE_URL=https://elruso.onrender.com
ENVEOF
  echo ""
  echo "  ================================================"
  echo "  IMPORTANTE: Revisar y editar $ENV_FILE"
  echo "  si necesitas cambiar la URL de la API."
  echo "  ================================================"
  echo ""
else
  echo "  $ENV_FILE ya existe."
fi

# ─── 5. Instalar servicio systemd ─────────────────────────────────
TEMPLATE="$REPO_DIR/ops/systemd/elruso-runner.service.template"
SERVICE_FILE="/etc/systemd/system/elruso-runner.service"

echo ""
echo "[5/6] Instalando servicio systemd..."

if [ ! -f "$TEMPLATE" ]; then
  echo "  ERROR: No se encuentra template en $TEMPLATE"
  exit 1
fi

# Materializar template reemplazando placeholders
sed \
  -e "s|__USER__|$REAL_USER|g" \
  -e "s|__REPO_DIR__|$REPO_DIR|g" \
  "$TEMPLATE" > "$SERVICE_FILE"

echo "  Unit file: $SERVICE_FILE"

# Reload + enable + start
systemctl daemon-reload
systemctl enable elruso-runner
systemctl restart elruso-runner

echo "  Servicio habilitado y arrancado."

# ─── 6. Verificar ─────────────────────────────────────────────────
echo ""
echo "[6/6] Verificacion..."
echo ""
sleep 2

systemctl status elruso-runner --no-pager -l || true

echo ""
echo "=== Ultimos logs ==="
journalctl -u elruso-runner -n 10 --no-pager || true

echo ""
echo "========================================"
echo "  Instalacion completa."
echo ""
echo "  Comandos utiles:"
echo "    sudo systemctl status elruso-runner"
echo "    sudo systemctl stop elruso-runner"
echo "    sudo systemctl start elruso-runner"
echo "    sudo journalctl -u elruso-runner -f"
echo ""
echo "  O usar el wrapper:"
echo "    $REPO_DIR/scripts/gcp_runner_ctl.sh status"
echo "    $REPO_DIR/scripts/gcp_runner_ctl.sh logs"
echo "========================================"
