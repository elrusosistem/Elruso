#!/usr/bin/env bash
set -euo pipefail

echo "=== Elruso Tests ==="

# Build types primero (dependencia)
echo "Building @elruso/types..."
pnpm --filter @elruso/types build

echo ""
echo "Running all tests..."
pnpm -r test

echo ""
echo "All tests passed."
