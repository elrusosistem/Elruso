#!/usr/bin/env bash
set -euo pipefail

# ─── run_agent.sh ─────────────────────────────────────────────────────
# Wrapper para registrar una ejecución del agente.
# Captura estado git pre/post, comandos ejecutados, y persiste en DB + archivo.
#
# Uso: ./scripts/run_agent.sh <TASK_ID> [comando...]
# Ejemplo: ./scripts/run_agent.sh T-013 pnpm -r build

if [ $# -lt 1 ]; then
  echo "Uso: $0 <TASK_ID> [comando...]"
  echo "Ejemplo: $0 T-013 pnpm -r build"
  exit 1
fi

TASK_ID="$1"
shift
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="reports/runs/${TIMESTAMP}_${TASK_ID}.md"
RUN_STATUS="done"

# ─── Capturar estado pre ──────────────────────────────────────────────
GIT_HEAD_PRE="$(git rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
GIT_BRANCH="$(git branch --show-current 2>/dev/null || echo 'detached')"

{
  echo "# Run Report: $TASK_ID"
  echo ""
  echo "- **Fecha**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- **Branch**: $GIT_BRANCH"
  echo "- **Commit pre**: $GIT_HEAD_PRE"
  echo "- **Task ID**: $TASK_ID"
  echo ""
} > "$REPORT_FILE"

# ─── Ejecutar comando (si se proporcionó) ─────────────────────────────
STEP_EXIT_CODE=0
STEP_OUTPUT=""

if [ $# -gt 0 ]; then
  CMD="$*"
  echo "## Comando" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo '```bash' >> "$REPORT_FILE"
  echo "$CMD" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  echo "[run_agent] Ejecutando: $CMD"

  # Capturar output (limitado a últimas 100 líneas para excerpt)
  TMPOUT="$(mktemp)"
  if eval "$CMD" 2>&1 | tee "$TMPOUT"; then
    STEP_EXIT_CODE=0
  else
    STEP_EXIT_CODE=$?
    RUN_STATUS="failed"
  fi
  STEP_OUTPUT="$(tail -100 "$TMPOUT")"
  rm -f "$TMPOUT"

  echo "## Output (exit code: $STEP_EXIT_CODE)" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo "$STEP_OUTPUT" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
fi

# ─── Capturar estado post ─────────────────────────────────────────────
GIT_HEAD_POST="$(git rev-parse --short HEAD 2>/dev/null || echo 'no-git')"

{
  echo "## Estado Git Post"
  echo ""
  echo "- **Commit post**: $GIT_HEAD_POST"
  echo ""
  echo "### git status"
  echo '```'
  git status -s 2>/dev/null || echo "(no git)"
  echo '```'
  echo ""
  echo "### git diff --stat"
  echo '```'
  git diff --stat 2>/dev/null || echo "(no changes)"
  echo '```'
  echo ""
} >> "$REPORT_FILE"

# ─── Capturar file changes ────────────────────────────────────────────
# Usar archivos temporales para evitar problemas con globs en case
FC_TMPFILE="$(mktemp)"
if command -v git >/dev/null 2>&1; then
  set +f  # disable glob para evitar expansión de ??
  git status --porcelain 2>/dev/null | while IFS= read -r line; do
    xy="${line:0:2}"
    filepath="${line:3}"
    change_type=""
    if [ "$xy" = "??" ] || [ "${xy:0:1}" = "A" ]; then
      change_type="added"
    elif [ "${xy:0:1}" = "M" ] || [ "${xy:1:1}" = "M" ]; then
      change_type="modified"
    elif [ "${xy:0:1}" = "D" ] || [ "${xy:1:1}" = "D" ]; then
      change_type="deleted"
    elif [ "${xy:0:1}" = "R" ]; then
      change_type="renamed"
    fi
    if [ -n "$change_type" ]; then
      echo "$filepath|$change_type" >> "$FC_TMPFILE"
    fi
  done
  set -f
fi

# ─── Persistir en DB (si hay creds) ──────────────────────────────────
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
  echo "[run_agent] Persistiendo en DB..."

  RUN_ID=$(psql "$DATABASE_URL" -t -A -c "
    INSERT INTO run_logs (task_id, status, branch, commit_hash, summary, artifact_path)
    VALUES ('$TASK_ID', '$RUN_STATUS', '$GIT_BRANCH', '$GIT_HEAD_POST', 'Ejecucion automatica', '$REPORT_FILE')
    RETURNING id;
  " 2>/dev/null || echo "")

  if [ -n "$RUN_ID" ]; then
    # Insertar step
    if [ $# -ge 0 ] && [ -n "${CMD:-}" ]; then
      # Escapar output para SQL (reemplazar comillas simples)
      SAFE_OUTPUT=$(echo "$STEP_OUTPUT" | head -50 | sed "s/'/''/g")
      psql "$DATABASE_URL" -q -c "
        INSERT INTO run_steps (run_id, step_name, cmd, exit_code, output_excerpt, finished_at)
        VALUES ('$RUN_ID', 'main', '$(echo "$CMD" | sed "s/'/''/g")', $STEP_EXIT_CODE, '$SAFE_OUTPUT', NOW());
      " 2>/dev/null || true
    fi

    # Insertar file changes
    if [ -s "$FC_TMPFILE" ]; then
      while IFS='|' read -r fc_path fc_type; do
        psql "$DATABASE_URL" -q -v "fc_run_id=$RUN_ID" -v "fc_path=$fc_path" -v "fc_type=$fc_type" \
          -c "INSERT INTO file_changes (run_id, path, change_type) VALUES (:'fc_run_id', :'fc_path', :'fc_type');" \
          2>/dev/null || true
      done < "$FC_TMPFILE"
    fi

    echo "[run_agent] Run $RUN_ID registrado en DB."
  else
    echo "[run_agent] WARN: No se pudo insertar en DB. Report generado como archivo."
    RUN_STATUS="blocked"
  fi
else
  echo "[run_agent] DB no disponible. Report generado solo como archivo."
  echo "- **Status**: blocked (sin DB creds)" >> "$REPORT_FILE"
fi

echo ""
echo "## Resultado Final" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- **Status**: $RUN_STATUS" >> "$REPORT_FILE"

rm -f "$FC_TMPFILE"

echo "[run_agent] Report: $REPORT_FILE"
echo "[run_agent] Status: $RUN_STATUS"
