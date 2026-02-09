#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy Staging API (Render) ==="

# ─── Cargar env vars desde vault local ────────────────────────────────
SCRIPT_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR_SELF/load_vault_env.sh"

# Verificar token
if [ -z "${RENDER_API_TOKEN:-}" ]; then
  echo "Error: RENDER_API_TOKEN no configurado."
  echo "Verificar /ops/REQUESTS.json (REQ-002)"
  exit 1
fi

# Verificar render CLI
command -v render >/dev/null 2>&1 || { echo "Error: render CLI no encontrado. Instalar: npm i -g @render/cli"; exit 1; }

echo "Triggerando deploy de staging API en Render..."
echo "NOTA: Render también puede deployar automáticamente por push a branch."

# El deploy real se triggerea por push al repo conectado a Render.
# Este script es para trigger manual via API si fuera necesario.
curl -s -X POST "https://api.render.com/v1/services/${RENDER_API_SERVICE_ID:-}/deploys" \
  -H "Authorization: Bearer $RENDER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": false}' | jq '.'

echo ""
echo "Deploy staging API triggerado. Verificar en Render dashboard."
