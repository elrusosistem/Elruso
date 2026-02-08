#!/usr/bin/env bash
# load_vault_env.sh — Carga env vars desde vault local y .env.runtime
# Uso: source scripts/load_vault_env.sh (antes de db_migrate, seed, etc.)
# No falla si no hay vault/runtime — solo carga si existen.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Cargar .env.runtime si existe (generado por API al guardar valores en panel)
RUNTIME_ENV="$ROOT_DIR/.env.runtime"
if [ -f "$RUNTIME_ENV" ]; then
  while IFS= read -r line; do
    # Skip empty lines and comments
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    # Only export if not already set in environment
    KEY="${line%%=*}"
    if [ -z "${!KEY:-}" ]; then
      export "$line"
    fi
  done < "$RUNTIME_ENV"
fi

# 2. Cargar desde vault JSON si existe y jq está disponible
VAULT_FILE="$ROOT_DIR/ops/.secrets/requests_values.json"
if [ -f "$VAULT_FILE" ] && command -v jq &>/dev/null; then
  while IFS='=' read -r key val; do
    [ -z "$key" ] && continue
    # Only export if not already set in environment
    if [ -z "${!key:-}" ]; then
      export "$key=$val"
    fi
  done < <(jq -r 'to_entries[] | .value | to_entries[] | "\(.key)=\(.value)"' "$VAULT_FILE" 2>/dev/null)
fi
