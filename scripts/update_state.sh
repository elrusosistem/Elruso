#!/usr/bin/env bash
set -euo pipefail

# update_state.sh — Actualiza ops/STATE.md con info live del repo
# Usar al final de cada run o antes de compose_gpt_prompt.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPS_DIR="$ROOT_DIR/ops"
STATE_FILE="$OPS_DIR/STATE.md"

# ─── Recopilar datos ─────────────────────────────────────────────────
HEAD_HASH=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
HEAD_MSG=$(git -C "$ROOT_DIR" log -1 --pretty=format:'%s' 2>/dev/null || echo "unknown")
BRANCH=$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || echo "unknown")

# Commits done (git log completo)
COMMITS_TABLE=""
while IFS= read -r line; do
  HASH=$(echo "$line" | cut -d'|' -f1)
  MSG=$(echo "$line" | cut -d'|' -f2)
  COMMITS_TABLE="$COMMITS_TABLE| 0 | $MSG | \`$HASH\` |
"
done < <(git -C "$ROOT_DIR" log --pretty=format:'%h|%s' --reverse 2>/dev/null)

# Requests waiting
REQUESTS_WAITING=""
if [ -f "$OPS_DIR/REQUESTS.json" ] && command -v jq &>/dev/null; then
  REQUESTS_WAITING=$(jq -r '.[] | select(.status == "WAITING") | "| \(.id) | \(.service) | \(.scopes | join(", ")) | \(.purpose | split(".")[0]) |"' "$OPS_DIR/REQUESTS.json" 2>/dev/null || echo "")
fi

# Tasks por estado
TASKS_DONE=""
TASKS_READY=""
TASKS_RUNNING=""
if [ -f "$OPS_DIR/TASKS.json" ] && command -v jq &>/dev/null; then
  TASKS_DONE=$(jq -r '[.[] | select(.status == "done")] | map(.id) | join(", ")' "$OPS_DIR/TASKS.json" 2>/dev/null || echo "")
  TASKS_READY=$(jq -r '[.[] | select(.status == "ready")] | map(.id) | join(", ")' "$OPS_DIR/TASKS.json" 2>/dev/null || echo "")
  TASKS_RUNNING=$(jq -r '[.[] | select(.status == "running")] | map(.id) | join(", ")' "$OPS_DIR/TASKS.json" 2>/dev/null || echo "")
fi

# Último run report
LAST_RUN=""
if [ -d "$ROOT_DIR/reports/runs" ]; then
  LAST_RUN=$(ls -1t "$ROOT_DIR/reports/runs/"*.md 2>/dev/null | head -1 || echo "")
fi
if [ -z "$LAST_RUN" ]; then
  LAST_RUN="No hay runs registrados aún"
fi

# Próximo objetivo (heurística: primera task ready)
NEXT_TASK=""
if [ -f "$OPS_DIR/TASKS.json" ] && command -v jq &>/dev/null; then
  NEXT_TASK=$(jq -r '[.[] | select(.status == "ready")] | first | "\(.id): \(.title)"' "$OPS_DIR/TASKS.json" 2>/dev/null || echo "Ninguna task ready")
  if [ "$NEXT_TASK" = "null: null" ]; then
    NEXT_TASK="Todas las tasks están done o bloqueadas"
  fi
fi

# ─── Generar STATE.md ─────────────────────────────────────────────────
cat > "$STATE_FILE" << STATEEOF
# STATE.md — Estado Vivo del Proyecto

> Generado automáticamente por scripts/update_state.sh
> Última actualización: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

---

## HEAD

\`\`\`
$HEAD_HASH $HEAD_MSG
\`\`\`

**Branch**: \`$BRANCH\`

---

## Pasos Completados (DONE)

| Paso | Descripción | Commits |
|---|---|---|
${COMMITS_TABLE}
---

## Paso Actual: EN ESPERA

**Fase 1** (Stock core) está lista para arrancar pero **bloqueada por credentials**.

---

## Requests WAITING

| ID | Servicio | Qué falta | Propósito |
|---|---|---|---|
${REQUESTS_WAITING:-| (ninguno) | - | - | - |}

---

## Próximo Objetivo Inmediato

1. **$NEXT_TASK**

---

## Último Run Report

$LAST_RUN

---

## Tasks por Estado

- **done**: ${TASKS_DONE:-ninguna}
- **ready**: ${TASKS_READY:-ninguna}
- **running**: ${TASKS_RUNNING:-ninguna}
STATEEOF

echo "STATE.md actualizado: $STATE_FILE"
echo "  HEAD: $HEAD_HASH $HEAD_MSG"
echo "  Branch: $BRANCH"
