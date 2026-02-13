#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# DEPRECATED — Este script fue reemplazado por:
#   - scripts/ops_sync_push.sh  (archivos → DB)
#   - scripts/ops_sync_pull.sh  (DB → archivos)
#
# Ver ops/DECISIONS.md (DEC-011) para contexto.
# ═══════════════════════════════════════════════════════════════════════
echo "ERROR: ops_sync.sh esta DEPRECATED."
echo ""
echo "Usar en su lugar:"
echo "  ./scripts/ops_sync_push.sh [--dry-run]   # archivos → DB"
echo "  ./scripts/ops_sync_pull.sh [--dry-run]   # DB → archivos"
exit 1
