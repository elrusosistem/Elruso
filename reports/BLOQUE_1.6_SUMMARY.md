# BLOQUE 1.6 — Runner Industrial Mínimo

**Fecha**: 2026-02-13
**Commit**: adbb3b5
**Deploy**: Render auto-deploy ✅

---

## Objetivo

Dejar el runner 24/7 "operable" y resistente a fallos comunes:
- Heartbeat visible (runner online/offline)
- Protección contra tasks colgadas (running > 15min)
- Reintentos básicos con backoff exponencial
- Filtro de elegibilidad (next_run_at)
- Observabilidad mínima (logs + endpoint estado)

---

## Entregables Completados

### A) DB Migrations ✅

**Archivo**: `db/migrations/005_runner_heartbeat_and_retries.sql`

1. **Tabla `runner_heartbeats`**:
   - id (UUID, PK)
   - runner_id (TEXT UNIQUE)
   - status (TEXT, CHECK: online/offline)
   - last_seen_at (TIMESTAMPTZ)
   - meta (JSONB)

2. **Columnas en `ops_tasks`**:
   - attempts (INT, default 0)
   - max_attempts (INT, default 3)
   - next_run_at (TIMESTAMPTZ)
   - last_error (TEXT)
   - claimed_by (TEXT)
   - claimed_at (TIMESTAMPTZ)
   - finished_at (TIMESTAMPTZ)

3. **Índices**:
   - `idx_ops_tasks_status_priority_next_run` (status, phase, next_run_at)
   - `idx_ops_tasks_claimed_by` (claimed_by, claimed_at)
   - `idx_ops_tasks_started_at` (started_at)
   - `idx_runner_heartbeats_runner_id` (runner_id)
   - `idx_runner_heartbeats_last_seen` (last_seen_at DESC)

**Aplicada**: ✅ Via `./scripts/db_migrate.sh`
**Fix**: Sintaxis psql variable compatible (escape manual vs `:variable`)

---

### B) API Endpoints ✅

**Archivo**: `apps/api/src/routes/ops.ts`

1. **POST /ops/runner/heartbeat**
   - Body: `{ runner_id, status?, meta? }`
   - Upsert por runner_id con last_seen_at = NOW()

2. **GET /ops/runner/status**
   - Devuelve todos los runners
   - Computed status: offline si last_seen > 60s ago

3. **POST /ops/tasks/claim** (actualizado)
   - Body: `{ task_id, runner_id }`
   - Atomic update con WHERE: `status='ready' AND (next_run_at IS NULL OR next_run_at <= NOW())`
   - Set: worker_id, claimed_by, claimed_at, started_at

4. **POST /ops/tasks/:id/requeue**
   - Body: `{ backoff_seconds? }` (default 10)
   - Marca status=ready, next_run_at=now+backoff
   - Solo si status=running

---

### C) Runner Scripts ✅

**Archivos**: `scripts/runner_local.sh`, `scripts/runner_daemon.sh`

**Cambios en runner_local.sh**:

1. **Config**:
   - RUNNER_ID: `runner-$(hostname)-$$`
   - HEARTBEAT_INTERVAL: 15s
   - STUCK_THRESHOLD_SECONDS: 900 (15min)

2. **Heartbeat**:
   - Función `send_heartbeat()` con throttle (solo si pasaron >= 15s)
   - Meta: hostname, pid, API URL

3. **Claim atómico**:
   - Usa runner_id en lugar de worker_id
   - Respeta next_run_at eligibility (delegado al endpoint)

4. **Retries con backoff**:
   - En failure: attempts++
   - Si attempts < max_attempts:
     - status=ready
     - next_run_at=now+backoff (10s → 30s → 120s exponencial)
     - last_error="steps failed (N/M)"
   - Si attempts >= max_attempts:
     - status=blocked
     - last_error="max_attempts reached"

5. **Anti-stuck sweep**:
   - Función `sweep_stuck_tasks()`
   - Query: tasks running con started_at < now()-15min
   - Requeue con backoff 30s

6. **Loop mode**:
   - Heartbeat en cada run_once
   - Sweep cada 10 iteraciones (~100s con POLL_INTERVAL=10)
   - Loop counter tracking

---

### D) Panel ❌ (NO implementado)

- No hay `apps/panel` todavía
- Endpoint GET /ops/runner/status funcional para futura UI

---

## Verificación Completa

### 1. Build ✅
```bash
pnpm build
# → Done (sin errores TS)
```

### 2. Tests ✅
```bash
pnpm --filter @elruso/api test
# → 18/18 passed
```

### 3. Test Local ✅
```bash
export API_BASE_URL="https://elruso.onrender.com"
./scripts/runner_local.sh
# → Task AUDIT-TEST ejecutada, heartbeat enviado, run creado
```

**Evidencia local**:
- Runner ID: `runner-MacBook-Pro-de-Abi.local-30843`
- Task claimed: AUDIT-TEST
- Run ID: d0468188-f3ab-4097-b773-3a9595285125
- File changes: 4 (migration, ops.ts, runner.sh, db_migrate.sh)

### 4. Test Prod ✅

**Endpoints verificados**:

```bash
# Heartbeat
curl -X POST https://elruso.onrender.com/ops/runner/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"runner_id":"evidence-001"}'
# → {"ok":true,"data":{"runner_id":"evidence-001","status":"online",...}}

# Runner status
curl https://elruso.onrender.com/ops/runner/status
# → {"ok":true,"data":[
#      {"runner_id":"evidence-001","status":"online"},
#      {"runner_id":"runner-MacBook-Pro-de-Abi.local-30843","status":"offline"},
#      {"runner_id":"test-001","status":"offline"}
#    ]}

# Tasks con nuevas columnas
curl https://elruso.onrender.com/ops/tasks
# → {"id":"AUDIT-TEST","attempts":0,"max_attempts":3,"claimed_by":"runner-..."}

# DB Stats
# done: 10 | ready: 16 | running: 3
```

---

## Archivos Modificados

| Archivo | Acción | LOC |
|---------|--------|-----|
| `db/migrations/005_runner_heartbeat_and_retries.sql` | CREATED | 30 |
| `apps/api/src/routes/ops.ts` | EDITED | +100 |
| `scripts/runner_local.sh` | EDITED | +80 |
| `scripts/db_migrate.sh` | FIXED | +2 |

**Total**: 4 archivos, ~212 líneas modificadas

---

## Comandos Ejecutados (Trazabilidad)

```bash
# 1. Migración aplicada
./scripts/db_migrate.sh
# → 1 aplicada, 4 ya existentes

# 2. Build + Tests
pnpm build
pnpm --filter @elruso/api test

# 3. Commit
git add -A
git commit -m "feat: BLOQUE 1.6 - Runner industrial con heartbeat, reintentos y anti-stuck"

# 4. Push
git push origin main
# → adbb3b5 pushed

# 5. Deploy (auto-deploy activado en Render)
# → Render detectó push, deployó automáticamente

# 6. Verificación prod
curl https://elruso.onrender.com/ops/runner/heartbeat -X POST ...
curl https://elruso.onrender.com/ops/runner/status
```

---

## Estado Final

**Deploy**: ✅ LIVE en https://elruso.onrender.com
**Commit**: adbb3b5
**DB**: Migración 005 aplicada
**API**: 4 endpoints nuevos funcionando
**Runner**: Heartbeat + retries + sweep operacional

**Runner 24/7 robusto**: ✅
- No duplica (claim atómico)
- Reintenta (backoff exponencial)
- Detecta colgadas (sweep anti-stuck)
- Reporta heartbeat (online/offline)

---

## Próximos Pasos (NO parte de este bloque)

- **Panel**: Widget "Runner: ONLINE/OFFLINE" con last_seen_at
- **Contrato GPT** (P4): Integración con GPT-4 para generación de directivas
- **Auth/Multitenant** (P5): Sistema de usuarios y permisos
