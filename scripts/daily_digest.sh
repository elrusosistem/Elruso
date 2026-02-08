#!/usr/bin/env bash
set -euo pipefail

# ─── daily_digest.sh ──────────────────────────────────────────────────
# Genera un resumen diario de las ejecuciones de las últimas 24h.
# Lee de DB si hay creds, sino de reports/runs/*.md
#
# Uso: ./scripts/daily_digest.sh

DIGEST_FILE="reports/daily.md"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
YESTERDAY="$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '')"

{
  echo "# Daily Digest - Elruso"
  echo ""
  echo "Generado: $NOW"
  echo ""
} > "$DIGEST_FILE"

# ─── Intentar leer de DB ──────────────────────────────────────────────
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo "## Ejecuciones (ultimas 24h)" >> "$DIGEST_FILE"
  echo "" >> "$DIGEST_FILE"

  RUNS=$(psql "$DATABASE_URL" -t -A -F'|' -c "
    SELECT task_id, status, branch, commit_hash, started_at, finished_at
    FROM run_logs
    WHERE started_at >= NOW() - INTERVAL '24 hours'
    ORDER BY started_at DESC;
  " 2>/dev/null || echo "")

  if [ -z "$RUNS" ]; then
    echo "Sin ejecuciones en las ultimas 24 horas." >> "$DIGEST_FILE"
  else
    echo "| Task | Status | Branch | Commit | Started | Finished |" >> "$DIGEST_FILE"
    echo "|------|--------|--------|--------|---------|----------|" >> "$DIGEST_FILE"

    echo "$RUNS" | while IFS='|' read -r task_id status branch commit started finished; do
      echo "| $task_id | $status | $branch | ${commit:-n/a} | $started | ${finished:-running} |" >> "$DIGEST_FILE"
    done
  fi

  echo "" >> "$DIGEST_FILE"

  # Resumen de stats
  STATS=$(psql "$DATABASE_URL" -t -A -F'|' -c "
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'done') as done,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'running') as running,
      COUNT(*) FILTER (WHERE status = 'blocked') as blocked
    FROM run_logs
    WHERE started_at >= NOW() - INTERVAL '24 hours';
  " 2>/dev/null || echo "0|0|0|0|0")

  IFS='|' read -r total done failed running blocked <<< "$STATS"
  {
    echo "## Resumen"
    echo ""
    echo "- Total: $total"
    echo "- Completados: $done"
    echo "- Fallidos: $failed"
    echo "- En ejecucion: $running"
    echo "- Bloqueados: $blocked"
  } >> "$DIGEST_FILE"

else
  # ─── Fallback: leer de archivos de reports ──────────────────────────
  echo "## Ejecuciones (desde archivos)" >> "$DIGEST_FILE"
  echo "" >> "$DIGEST_FILE"
  echo "_(DB no disponible - leyendo de reports/runs/)_" >> "$DIGEST_FILE"
  echo "" >> "$DIGEST_FILE"

  REPORT_COUNT=0
  for report in reports/runs/*.md; do
    [ -f "$report" ] || continue
    BASENAME="$(basename "$report" .md)"
    TASK=$(echo "$BASENAME" | sed 's/^[0-9_]*_//')
    DATE=$(echo "$BASENAME" | grep -o '^[0-9]*' | head -1)

    echo "- **$TASK** ($DATE) - [report]($report)" >> "$DIGEST_FILE"
    REPORT_COUNT=$((REPORT_COUNT + 1))
  done

  if [ "$REPORT_COUNT" -eq 0 ]; then
    echo "Sin reports encontrados." >> "$DIGEST_FILE"
  fi

  {
    echo ""
    echo "## Resumen"
    echo ""
    echo "- Total reports: $REPORT_COUNT"
    echo "- Fuente: archivos (sin DB)"
  } >> "$DIGEST_FILE"
fi

echo ""
echo "[daily_digest] Digest generado: $DIGEST_FILE"
