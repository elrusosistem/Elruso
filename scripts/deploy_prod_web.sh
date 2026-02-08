#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy PRODUCCIÓN Web (Vercel) ==="
echo ""
echo "⚠  ATENCIÓN: Estás por deployar a PRODUCCIÓN."
echo ""

read -p "¿Confirmar deploy a producción? (escribe 'si-produccion' para confirmar): " CONFIRM
if [ "$CONFIRM" != "si-produccion" ]; then
  echo "Deploy cancelado."
  exit 0
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "Error: VERCEL_TOKEN no configurado."
  exit 1
fi

command -v vercel >/dev/null 2>&1 || { echo "Error: vercel CLI no encontrado."; exit 1; }

echo "Deployando a producción..."

cd apps/web
vercel --token "$VERCEL_TOKEN" --prod --yes

echo ""
echo "Deploy producción web completado."
