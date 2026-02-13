# BLOQUE P2 — Higiene Operativa: Reporte Final

**Fecha**: 2026-02-13
**Commit**: cb0f775
**Deploy**: LIVE en Render

---

## OBJETIVO

Implementar higiene operativa para mantener DB limpia, performante y auditable sin pérdida de evidencia.

---

## AUDITORÍA INICIAL (ANTES)

### Inflación de Runs

**Total runs en DB**: 42

**Top 10 tasks con más runs**:
```
T-020: 5 runs
T-GPT-1770614805758-7ya6: 2 runs
T-GPT-1770614805494-61sp: 2 runs
T-062: 2 runs
T-061: 2 runs
T-060: 2 runs
T-052: 2 runs
T-051: 2 runs
T-050: 2 runs
T-042: 2 runs
```

**Duplicados detectados** (mismo task_id + commit_hash):
- T-020 + commit de81659: 2 runs
- T-GPT-1770614805494-61sp + commit a63bd24: 2 runs
- T-GPT-1770614805758-7ya6 + commit a63bd24: 2 runs

**Total duplicados**: 3 tasks con duplicación (6 runs → 3 deberían ser borrados)

---

## IMPLEMENTACIÓN COMPLETADA

### 1. Scripts de Mantenimiento ✅

#### A) Export/Backup
**Archivo**: `scripts/maintenance_export_runs.sh`

**Funcionalidad**:
- Exporta run_logs, run_steps, file_changes desde API
- Formato JSON
- Configurable: `--since_days N`, `--out_dir PATH`
- Output: run_logs.json, run_steps.json, file_changes.json, summary.txt

**Test ejecutado**:
```
Export complete: /tmp/elruso_export_test
  Runs: 42
  Steps: 126
  File changes: 10
```

#### B) Deduplicación Plan
**Archivo**: `scripts/maintenance_dedupe_plan.sh`

**Funcionalidad**:
- Detecta duplicados (criterio: task_id + commit_hash)
- Keep: más nuevo (max started_at)
- Drop: resto
- NO destructivo (solo genera plan JSON)

**Test ejecutado**:
```json
{
  "total_runs": 42,
  "keep_count": 3,
  "drop_count": 3,
  "drop_run_ids": [
    "37532146-b1b4-4b1f-ad23-964d0dbca235",
    "964dd430-5fa5-4986-b01f-36796526c619",
    "a6a9e527-3b34-432a-9348-2119c4ed453e"
  ]
}
```

#### C) Deduplicación Apply
**Archivo**: `scripts/maintenance_dedupe_apply.sh`

**Funcionalidad**:
- Aplica plan generado
- DESTRUCTIVO: requiere confirmación manual ("yes-delete")
- Dry-run por default
- Orden seguro: run_steps → file_changes → run_logs
- Transacción única (rollback si falla)

**Estado**: Implementado, NO aplicado en prod (esperando aprobación humana)

---

### 2. Migración de Índices ✅

**Archivo**: `db/migrations/006_performance_indexes.sql`

**Índices agregados**:
- `idx_run_logs_task_id`: Queries de runs por task
- `idx_run_logs_task_id_started_at`: Runs por task ordenados por fecha
- `idx_ops_tasks_status_created_at`: Backlog age queries
- `idx_ops_directives_created_at`: Directives ordenadas por fecha

**Aplicación**: ✅ Migración aplicada en DB (local + prod via db_migrate.sh)

**Beneficio**:
- Queries `/runs?task_id=X` más rápidas
- Metrics endpoint más eficiente
- Panel web con mejor performance al cargar runs

---

### 3. Documentación ✅

**Archivo**: `ops/MAINTENANCE.md`

**Contenido**:
- ¿Cuándo correr mantenimiento? (frecuencia, señales de alarma)
- Scripts de export/dedupe (uso paso a paso)
- Verificación post-mantenimiento (counts, metrics, panel)
- Calendario recomendado (semanal)
- Troubleshooting completo
- Restaurar desde backup (si algo sale mal)
- Prevención de inflación (buenas prácticas)

---

### 4. Gitignore ✅

**Cambio**: `reports/maintenance/` agregado a `.gitignore`

**Razón**: Exports contienen data completa de runs/steps/file_changes. No deben subirse al repo.

---

## ESTADO POST-IMPLEMENTACIÓN

### Metrics (Prod)

```json
{
  "tasks": {
    "ready": 21,
    "running": 3,
    "blocked": 0,
    "failed": 0,
    "done": 14
  },
  "runners": {
    "online": 0,
    "total": 7
  }
}
```

### Runs

- **Total**: 42 runs (sin cambio, dedupe NO aplicado todavía)
- **Duplicados detectados**: 3 runs
- **Plan generado**: listo para aplicar cuando humano apruebe

---

## PRÓXIMOS PASOS RECOMENDADOS

### 1. Aplicar Dedupe en Prod (Requiere aprobación humana)

```bash
# 1. Export/backup (OBLIGATORIO antes de borrar)
./scripts/maintenance_export_runs.sh

# 2. Generar plan fresco
./scripts/maintenance_dedupe_plan.sh

# 3. Revisar plan
cat reports/maintenance/dedupe_plan_*.json | jq .

# 4. Dry-run
./scripts/maintenance_dedupe_apply.sh --plan reports/maintenance/dedupe_plan_*.json --dry-run

# 5. Apply (si plan OK)
./scripts/maintenance_dedupe_apply.sh --plan reports/maintenance/dedupe_plan_*.json --apply
```

**Resultado esperado después de apply**:
- Total runs: 42 → 39 (3 borrados)
- Duplicados: 3 → 0

### 2. Programar Mantenimiento Semanal

Agregar a cron/scheduler:
```bash
# Cada domingo a las 3am UTC
0 3 * * 0 cd /path/to/Elruso && ./scripts/maintenance_export_runs.sh
```

### 3. Monitorear Inflación

Dashboard/alertas:
- Alert si `/ops/metrics` muestra runs > 1000
- Alert si task tiene > 10 runs con mismo commit
- Alert si backlog age > 7 días sin razón

---

## ARCHIVOS MODIFICADOS

| Archivo | Acción | LOC |
|---------|--------|-----|
| `scripts/maintenance_export_runs.sh` | CREATED | 97 |
| `scripts/maintenance_dedupe_plan.sh` | CREATED | 130 |
| `scripts/maintenance_dedupe_apply.sh` | CREATED | 144 |
| `db/migrations/006_performance_indexes.sql` | CREATED | 13 |
| `ops/MAINTENANCE.md` | CREATED | 362 |
| `.gitignore` | MODIFIED | +1 |

**Total**: 6 archivos, 747 líneas

---

## COMMITS

| SHA | Mensaje |
|-----|---------|
| cb0f775 | feat: BLOQUE P2 - higiene operativa DB (export + dedupe + indexes) |

---

## VERIFICACIÓN COMPLETA ✅

- ✅ Build: pnpm build OK
- ✅ Tests: 18/18 passed
- ✅ Export script: 42 runs, 126 steps, 10 file_changes exportados
- ✅ Dedupe plan: 3 duplicados detectados
- ✅ Migración: 006 aplicada (4 índices agregados)
- ✅ Endpoints prod: /health OK, /ops/metrics OK
- ✅ Deploy: Render auto-deploy exitoso

---

## CRITERIO DE ACEPTACIÓN CUMPLIDO ✅

- ✅ Scripts de export + dedupe (plan/apply) listos y documentados
- ✅ Migración de índices aplicada
- ✅ Reporte P2 con números antes/después (este documento)
- ✅ NO se perdió data (dedupe NO aplicado sin aprobación humana)
- ✅ Todo reproducible por CLI

---

**DB Limpia**: READY (scripts disponibles, esperando aprobación para apply)
**DB Performante**: ✅ DONE (índices aplicados)
**DB Auditable**: ✅ DONE (export/backup disponible)
