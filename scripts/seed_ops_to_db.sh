#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# DEPRECATED — Este script fue reemplazado por:
#   - scripts/ops_sync_push.sh  (archivos → DB via REST API)
#
# El seed ahora usa REST API en vez de psql directamente.
# Ver ops/DECISIONS.md (DEC-011) para contexto.
# ═══════════════════════════════════════════════════════════════════════
echo "ERROR: seed_ops_to_db.sh esta DEPRECATED."
echo ""
echo "Usar en su lugar:"
echo "  ./scripts/ops_sync_push.sh [--dry-run]   # archivos → DB (via REST API)"
exit 1
