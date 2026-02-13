# MAINTENANCE — Higiene Operativa El Ruso

Guía de mantenimiento para mantener la DB limpia, performante y auditable.

---

## ¿Cuándo correr mantenimiento?

**Frecuencia recomendada**: Semanal o cuando:
- `/ops/metrics` muestra `runs` creciendo desproporcionalmente vs tasks done
- Queries de `/runs` se vuelven lentas (> 2s)
- DB usage en Supabase dashboard crece sin control

**Señales de alarma**:
- Task tiene > 10 runs con mismo commit_hash
- Total runs > 1000 y solo 100 tasks done
- Backlog age > 7 días sin razón operativa

---

## Scripts de Mantenimiento

### 1. Export/Backup (SIEMPRE PRIMERO)

Antes de cualquier limpieza, exportar data para backup.

```bash
cd /path/to/Elruso

# Export completo (últimos 30 días por default)
./scripts/maintenance_export_runs.sh

# Export custom
./scripts/maintenance_export_runs.sh --since_days 60 --out_dir /tmp/backup_runs

# Verificar export
ls -lh reports/maintenance/export_*/
cat reports/maintenance/export_*/summary.txt
```

**Output**:
- `run_logs.json`: Todos los runs
- `run_steps.json`: Todos los steps de esos runs
- `file_changes.json`: Todos los file_changes
- `summary.txt`: Resumen de conteos

**IMPORTANTE**: Los exports NO se suben a git (están en `.gitignore`). Guardar en S3/Drive si se necesita backup a largo plazo.

---

### 2. Generar Plan de Deduplicación

Analiza duplicados sin borrar nada.

**Criterio de duplicado**:
- Mismo `task_id`
- Mismo `commit_hash`
- Runs iniciados dentro de 10 minutos entre sí
- **Keep**: El más nuevo (max `started_at`)
- **Drop**: El resto

```bash
# Generar plan
./scripts/maintenance_dedupe_plan.sh

# Output: reports/maintenance/dedupe_plan_<timestamp>.json
```

**Output esperado**:
```
=== Elruso Dedupe Plan Generator ===
  Total runs: 42
  Keep: 39 runs
  Drop: 3 runs (duplicates)

Plan saved: reports/maintenance/dedupe_plan_20260213_030000.json
```

**Revisar el plan**:
```bash
# Ver qué se va a borrar
jq '.drop_run_ids' reports/maintenance/dedupe_plan_*.json

# Ver detalles
jq '.' reports/maintenance/dedupe_plan_*.json
```

---

### 3. Aplicar Deduplicación (DESTRUCTIVO)

**⚠️ WARNING**: Esto BORRA data de la DB. Irreversible.

**Prerrequisitos**:
1. ✅ Export/backup completado
2. ✅ Plan revisado y aprobado
3. ✅ DATABASE_URL configurado en vault

```bash
# Dry-run (muestra qué se borraría)
./scripts/maintenance_dedupe_apply.sh \
  --plan reports/maintenance/dedupe_plan_<timestamp>.json \
  --dry-run

# Apply (DESTRUCTIVO - pide confirmación)
./scripts/maintenance_dedupe_apply.sh \
  --plan reports/maintenance/dedupe_plan_<timestamp>.json \
  --apply
```

**Confirmación requerida**:
```
⚠️  WARNING: This will DELETE 3 runs from the database.
⚠️  This action is IRREVERSIBLE.

Type 'yes-delete' to confirm: yes-delete
```

**Qué hace**:
1. DELETE FROM `run_steps` WHERE run_id IN (...)
2. DELETE FROM `file_changes` WHERE run_id IN (...)
3. DELETE FROM `run_logs` WHERE id IN (...)

Todo en una transacción. Si falla, rollback automático.

---

## Verificación Post-Mantenimiento

Después de aplicar limpieza, verificar que todo sigue funcionando:

### 1. Counts en DB

```bash
API_BASE_URL="https://elruso.onrender.com"

# Total runs
curl -s "$API_BASE_URL/runs" | jq '.data | length'

# Runs por task (top 10)
curl -s "$API_BASE_URL/runs" | jq -r '
.data |
group_by(.task_id) |
map({task_id: .[0].task_id, runs: length}) |
sort_by(.runs) | reverse | .[0:10]'

# Verificar que no hay duplicados obvios
curl -s "$API_BASE_URL/runs" | jq -r '
.data |
group_by(.task_id + "-" + (.commit_hash // "null")) |
map(select(length > 1)) |
length'
# Output esperado: 0
```

### 2. Metrics siguen OK

```bash
curl -s "$API_BASE_URL/ops/metrics" | jq .
```

**Qué verificar**:
- `runs.last_run_at`: Sigue siendo reciente
- `runs.fail_rate_last_20`: No cambió drásticamente
- `tasks`: Conteos normales

### 3. Panel funciona

Abrir https://elruso.vercel.app/#/runs y verificar:
- Lista de runs carga OK
- Detalle de run muestra steps + file_changes
- No hay errores 404 o datos faltantes

---

## Migraciones de Performance

Índices agregados en migración 006:
- `idx_run_logs_task_id`: Queries de runs por task
- `idx_run_logs_task_id_started_at`: Runs por task ordenados
- `idx_ops_tasks_status_created_at`: Backlog age queries
- `idx_ops_directives_created_at`: Directives ordenadas

**Aplicar migración**:
```bash
./scripts/db_migrate.sh
```

**Verificar índices en prod**:
```sql
-- En Supabase SQL Editor
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('run_logs', 'ops_tasks', 'ops_directives')
ORDER BY tablename, indexname;
```

---

## Calendario de Mantenimiento Recomendado

| Tarea | Frecuencia | Comando |
|-------|-----------|---------|
| Export/backup | Semanal | `./scripts/maintenance_export_runs.sh` |
| Generar plan dedupe | Semanal | `./scripts/maintenance_dedupe_plan.sh` |
| Aplicar dedupe | Si plan > 10 drops | `./scripts/maintenance_dedupe_apply.sh --plan ... --apply` |
| Verificar metrics | Diario | `curl .../ops/metrics` |
| Revisar logs daemon | Diario | `./scripts/runner_daemon.sh logs` |

---

## Troubleshooting Mantenimiento

### Export falla

**Síntomas**: `maintenance_export_runs.sh` devuelve error

**Diagnóstico**:
1. Verificar API está up: `curl $API_BASE_URL/health`
2. Verificar que `/runs` endpoint responde: `curl $API_BASE_URL/runs | jq .ok`

**Fix**: Si API está down, deployar o esperar a que Render reactive.

### Dedupe plan genera 0 drops cuando claramente hay duplicados

**Causa**: Criterio de ventana (10 min) muy estricto

**Fix**: Editar `maintenance_dedupe_plan.sh` y cambiar `WINDOW_MINUTES` a valor mayor (ej: 60).

### Dedupe apply falla con "psql: command not found"

**Causa**: psql no instalado o no en PATH

**Fix**:
```bash
# macOS
brew install libpq
brew link --force libpq

# Verificar
psql --version
```

### Dedupe apply falla con "DATABASE_URL not configured"

**Causa**: Vault no cargado

**Fix**:
```bash
source scripts/load_vault_env.sh
echo $DATABASE_URL  # Debe mostrar connection string
```

### Dedupe apply falla con "DELETE failed"

**Causa posible**: Constraint FK o run_id no existe

**Diagnóstico**:
1. Ver error de psql en output
2. Revisar que run_ids en plan existen en DB:
```sql
SELECT id FROM run_logs WHERE id IN ('run-id-1', 'run-id-2');
```

**Fix**: Regenerar plan con data fresca.

---

## Restaurar desde Backup

Si algo sale mal después de dedupe:

### 1. Detener runner daemon

```bash
./scripts/runner_daemon.sh stop
```

### 2. Restaurar desde export

```bash
# Conectar a Supabase SQL Editor
# Copiar data de JSON exports a tablas

# Ejemplo para run_logs
INSERT INTO run_logs (id, started_at, finished_at, task_id, status, ...)
SELECT * FROM json_populate_recordset(null::run_logs, '
  [JSON content from run_logs.json]
');
```

**NOTA**: Esto es manual y tedioso. Por eso es crítico el export antes de borrar.

### 3. Verificar data restaurada

```bash
curl -s "$API_BASE_URL/runs" | jq '.data | length'
```

### 4. Reiniciar runner

```bash
./scripts/runner_daemon.sh start
```

---

## Prevención: Evitar Inflación

**Buenas prácticas para evitar duplicados**:
1. **Runner único por ambiente**: No correr múltiples runners contra prod sin coordinación
2. **Claim atómico**: Ya implementado, no modificar la lógica de claim
3. **Idempotencia**: Tasks deben ser idempotentes (re-ejecutables sin efectos secundarios)
4. **Monitoreo**: Revisar `/ops/metrics` regularmente para detectar inflación temprano

**Si necesitas re-ejecutar una task**:
- Usar `PATCH /ops/tasks/:id` para cambiar status a `ready`
- Dejar que runner la tome naturalmente
- NO ejecutar runner múltiples veces manualmente en paralelo

---

**Última actualización**: 2026-02-13
**Scripts de mantenimiento**: ✅ DISPONIBLES
**Migración de índices**: 006
