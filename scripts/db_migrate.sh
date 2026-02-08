#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso DB Migrate ==="

# ─── Validar DATABASE_URL ─────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL no configurada."
  echo ""
  echo "Obtener de Supabase Dashboard > Project Settings > Database > Connection string (URI)."
  echo "Formato: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
  echo ""
  echo "Verificar /ops/REQUESTS.json (REQ-005)"
  exit 1
fi

# ─── Validar psql disponible ──────────────────────────────────────────
if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql no encontrado."
  echo ""
  echo "Instalar:"
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt-get install postgresql-client"
  exit 1
fi

# ─── Verificar conectividad ───────────────────────────────────────────
echo "Verificando conexión a la base de datos..."
if ! psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "Error: no se pudo conectar a la base de datos."
  echo "Verificar DATABASE_URL y que el host sea accesible."
  exit 1
fi
echo "Conexión OK."
echo ""

# ─── Crear tabla de control de migraciones (idempotente) ──────────────
psql "$DATABASE_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ─── Directorio de migraciones ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../db/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No hay directorio de migraciones ($MIGRATIONS_DIR)."
  echo "Crear archivos .sql con formato: 001_nombre.sql, 002_nombre.sql, etc."
  exit 0
fi

# ─── Ejecutar migraciones pendientes ──────────────────────────────────
APPLIED=0
SKIPPED=0

for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  FILENAME="$(basename "$migration")"

  # Verificar si ya fue aplicada
  ALREADY_APPLIED=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM _migrations WHERE filename = '$FILENAME';")

  if [ "$ALREADY_APPLIED" -gt 0 ]; then
    echo "SKIP: $FILENAME (ya aplicada)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Ejecutar migración dentro de transacción
  echo "EXEC: $FILENAME"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$migration"; then
    # Registrar migración aplicada
    psql "$DATABASE_URL" -q -c "INSERT INTO _migrations (filename) VALUES ('$FILENAME');"
    echo "  OK"
    APPLIED=$((APPLIED + 1))
  else
    echo "  ERROR en $FILENAME. Abortando."
    exit 1
  fi
done

echo ""
echo "Resultado: $APPLIED aplicadas, $SKIPPED ya existentes."
echo "Migraciones completadas."
