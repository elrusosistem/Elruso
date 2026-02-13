# BLOQUE P0 — Status Report

## P0.1: Source of Truth (DB manda)

- **Documentado en**: `ops/DECISIONS.md` (DEC-011)
- DB es unica fuente de verdad para tasks, requests, directives
- ops/*.json son espejos editables (bootstrap/seed)
- Sync explicito con dry-run + diff

## P0.2: Sync explicito (DB <-> ops)

Scripts funcionales:

| Script | Funcion | Flags |
|--------|---------|-------|
| `scripts/ops_sync_push.sh` | archivos -> DB (upsert) | `--dry-run` (default muestra diff) |
| `scripts/ops_sync_pull.sh` | DB -> archivos (export) | `--dry-run` (default muestra diff) |

Deprecados:
- `scripts/ops_sync.sh` — reemplazado
- `scripts/seed_ops_to_db.sh` — reemplazado

## P0.3: Seed control

- Tabla `_seed_control` creada en migration 003
- Columnas `seed_hash` y `git_sha` agregadas en migration 009
- Registros de seed idempotentes por hash de contenido

## P0.4: Fix seed/import

- `ops_sync_push.sh` respeta el status real del archivo (no overridea a "done")
- Verificado: REQ-009 mantiene status correcto (PROVIDED) tras push

## P0.5: Normalizacion DB

### Acciones ejecutadas
1. Push de ops/TASKS.json → DB (22 tasks canonicas con status real)
2. Limpieza de 10 smoke/test tasks huerfanas de DB
3. Fix REQ-009 status: WAITING → PROVIDED
4. Pull de DB → archivos (28 tasks totales incluyendo GPT-generated)
5. Pull de directives (6 en DB, 3 PENDING_REVIEW)

### Evidencia de round-trip estable

```
$ ./scripts/ops_sync_push.sh --dry-run
--- TASKS (ops_tasks) ---
  (sin diferencias)
--- REQUESTS (ops_requests) ---
  (sin diferencias)
--- DIRECTIVES (ops_directives) ---
  (sin diferencias)
```

**0 diferencias.** Push → Pull → Push = idempotente.

### Estado final de la DB

- Tasks: 28 (22 canonicas + 5 GPT-generated + T-LOOP-001)
- Requests: 9 (8 PROVIDED + 1 PROVIDED [REQ-009])
- Directives: 6 (3 PENDING_REVIEW, 2 APPLIED, 1 APPROVED)
- Smoke tests: eliminados (10)

## Migracion 009

```sql
ALTER TABLE _seed_control ADD COLUMN IF NOT EXISTS seed_hash TEXT;
ALTER TABLE _seed_control ADD COLUMN IF NOT EXISTS git_sha TEXT;
```

Aplicada y registrada en `_migrations`.
