#!/usr/bin/env bash
set -euo pipefail

# ─── compose_gpt_prompt.sh ────────────────────────────────────────────
# Genera prompt mínimo y estable para GPT via API.
# Usa POST /ops/gpt/compose (server-side, sin secrets locales).
#
# Uso:
#   ./scripts/compose_gpt_prompt.sh
#   API_BASE_URL=http://localhost:3001 ./scripts/compose_gpt_prompt.sh
#
# Output: reports/gpt/prompts/<timestamp>.md

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="$ROOT/reports/gpt/prompts/${TIMESTAMP}.md"

API_BASE_URL="${API_BASE_URL:-https://elruso.onrender.com}"

echo "=== Elruso GPT Compose ==="
echo "  API: $API_BASE_URL"
echo "  Output: $OUTPUT"
echo ""

# Llamar al endpoint compose (server-side, mínimo y estable)
RESPONSE=$(curl -sf -X POST "${API_BASE_URL}/ops/gpt/compose" -H "Content-Type: application/json") || {
  echo "ERROR: No se pudo conectar a la API ($API_BASE_URL)"
  echo "Verificar que la API esta corriendo."
  exit 1
}

OK=$(echo "$RESPONSE" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "desconocido"')
  echo "ERROR: $ERROR"
  exit 1
fi

PROMPT=$(echo "$RESPONSE" | jq -r '.data.prompt')
CHAR_COUNT=$(echo "$RESPONSE" | jq -r '.data.char_count')

mkdir -p "$(dirname "$OUTPUT")"
echo "$PROMPT" > "$OUTPUT"

echo "[compose] Prompt generado: $OUTPUT"
echo "[compose] Tamano: ${CHAR_COUNT} chars"
echo ""
echo "Siguiente paso:"
echo "  1. Pegar contenido en GPT"
echo "  2. O ejecutar: curl -X POST ${API_BASE_URL}/ops/gpt/run"
echo "     (llama a GPT automaticamente y crea directivas PENDING_REVIEW)"
