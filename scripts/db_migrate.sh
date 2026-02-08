#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso DB Migrate ==="

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos."
  echo "Verificar /ops/REQUESTS.json (REQ-001)"
  exit 1
fi

MIGRATIONS_DIR="./db/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No hay directorio de migraciones ($MIGRATIONS_DIR). Creando..."
  mkdir -p "$MIGRATIONS_DIR"
  echo "Directorio creado. Agregar archivos .sql de migración."
  exit 0
fi

# Ejecutar migraciones en orden
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  echo "Ejecutando: $(basename "$migration")"

  curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(cat "$migration" | jq -Rs .)}" \
    && echo " OK" \
    || echo " ERROR"
done

echo ""
echo "Migraciones completadas."
