#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso Worker ==="

# Verificar variables requeridas
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos."
  echo "Verificar /ops/REQUESTS.json (REQ-001)"
  exit 1
fi

echo "Iniciando worker..."
cd apps/worker
node dist/index.js
