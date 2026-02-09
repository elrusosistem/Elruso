#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy Staging Web (Vercel) ==="

# ─── Cargar env vars desde vault local ────────────────────────────────
SCRIPT_DIR_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./load_vault_env.sh
source "$SCRIPT_DIR_SELF/load_vault_env.sh"

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "Error: VERCEL_TOKEN no configurado."
  echo "Verificar /ops/REQUESTS.json (REQ-003)"
  exit 1
fi

command -v vercel >/dev/null 2>&1 || { echo "Error: vercel CLI no encontrado. Instalar: npm i -g vercel"; exit 1; }

echo "Building y deployando a staging (preview)..."

cd apps/web
vercel --token "$VERCEL_TOKEN" --yes

echo ""
echo "Deploy staging web completado."
