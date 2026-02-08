#!/usr/bin/env bash
set -euo pipefail

echo "=== Deploy PRODUCCIÓN API (Render) ==="
echo ""
echo "⚠  ATENCIÓN: Estás por deployar a PRODUCCIÓN."
echo ""

read -p "¿Confirmar deploy a producción? (escribe 'si-produccion' para confirmar): " CONFIRM
if [ "$CONFIRM" != "si-produccion" ]; then
  echo "Deploy cancelado."
  exit 0
fi

if [ -z "${RENDER_API_TOKEN:-}" ]; then
  echo "Error: RENDER_API_TOKEN no configurado."
  exit 1
fi

echo "Triggerando deploy de producción API en Render..."

curl -s -X POST "https://api.render.com/v1/services/${RENDER_PROD_API_SERVICE_ID:-}/deploys" \
  -H "Authorization: Bearer $RENDER_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": false}' | jq '.'

echo ""
echo "Deploy producción API triggerado."
