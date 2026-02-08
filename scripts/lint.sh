#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso Lint ==="

echo "Running typecheck..."
pnpm -r typecheck

echo ""
echo "Running lint..."
pnpm -r lint

echo ""
echo "Lint passed."
