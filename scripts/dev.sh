#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso Dev Mode ==="
echo "Iniciando API (3001), Web (3000) y Worker..."
echo ""

# Verificar pnpm
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm no encontrado. Instalar con: npm i -g pnpm"; exit 1; }

# Instalar deps si no existen
if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias..."
  pnpm install
fi

# Ejecutar en paralelo
pnpm --filter @elruso/api dev &
PID_API=$!

pnpm --filter @elruso/web dev &
PID_WEB=$!

pnpm --filter @elruso/worker dev &
PID_WORKER=$!

echo ""
echo "PIDs: API=$PID_API  Web=$PID_WEB  Worker=$PID_WORKER"
echo "Ctrl+C para detener todos."

trap "kill $PID_API $PID_WEB $PID_WORKER 2>/dev/null; exit 0" SIGINT SIGTERM
wait
