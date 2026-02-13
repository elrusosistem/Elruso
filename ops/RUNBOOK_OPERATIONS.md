# RUNBOOK — Operaciones El Ruso

Guía operativa para ejecutar y monitorear El Ruso en producción (motor 24/7).

---

## Arquitectura Operativa

- **API**: https://elruso.onrender.com (Render, auto-deploy desde main)
- **Panel**: https://elruso.vercel.app (Vercel, auto-deploy desde main)
- **DB**: Supabase PostgreSQL (us-east-1, source of truth)
- **Runner**: Máquina/VM con runner_daemon.sh (consume tasks READY, crea runs)

---

## Credenciales (Vault)

Todas las credenciales están en el vault local (`~/.elruso/vault/`). Ver `/ops/REQUESTS.json` para lista completa.

**Críticas para operación**:
- `REQ-001`: Supabase (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)
- `REQ-005`: Database URL (DATABASE_URL para migraciones)
- `REQ-009`: OpenAI API Key (OPENAI_API_KEY para GPT)

### Cargar credenciales en panel

1. Abrir https://elruso.vercel.app/#/setup
2. Seleccionar REQUEST (ej: REQ-009 OPENAI_API_KEY)
3. Ingresar valores
4. Submit → Se guardan en vault local + DB se actualiza a PROVIDED

---

## Ejecutar GPT Programáticamente

**Endpoint**: `POST /ops/gpt/run`

```bash
API_BASE_URL="https://elruso.onrender.com"

# Ejecutar GPT en producción
curl -s -X POST "$API_BASE_URL/ops/gpt/run" \
  -H "Content-Type: application/json" \
  -d '{"environment":"production"}' | jq .

# Respuesta esperada:
# {
#   "ok": true,
#   "data": {
#     "directives_created": N,
#     "tasks_created": M,
#     "directives": [...],
#     "model": "gpt-4.1",
#     "usage": {...}
#   }
# }
```

**Qué hace**:
1. Lee contexto del proyecto (GPT_CONTEXT.md, TASKS.json, decisiones, último run)
2. Llama a OpenAI GPT-4.1
3. Crea directivas en `ops_directives` (status: PENDING)
4. Crea tasks en `ops_tasks` (status: ready)

**Frecuencia recomendada**: 1-2 veces/día o después de commits importantes.

---

## Runner Daemon (24/7)

El runner daemon consume tasks READY, ejecuta, crea runs, y registra resultados.

### Arrancar runner

```bash
cd /path/to/Elruso

# Configurar API (prod o local)
export API_BASE_URL="https://elruso.onrender.com"

# Arrancar daemon
./scripts/runner_daemon.sh start

# Verificar status
./scripts/runner_daemon.sh status

# Ver logs en tiempo real
./scripts/runner_daemon.sh logs
```

**Output esperado**:
```
Runner daemon arrancado (PID 12345)
  API: https://elruso.onrender.com
  Logs: /path/to/Elruso/reports/runs/runner_daemon.log
  PID: /path/to/Elruso/.tmp/runner.pid
```

### Detener runner

```bash
./scripts/runner_daemon.sh stop
```

### Logs

```bash
# Últimas 50 líneas
./scripts/runner_daemon.sh logs

# Tail continuo
tail -f reports/runs/runner_daemon.log
```

---

## Verificar Operación

### 1. Metrics (salud global)

```bash
curl -s "$API_BASE_URL/ops/metrics" | jq .
```

**Qué ver**:
- `tasks.ready > 0`: Hay backlog
- `tasks.running > 0`: Runner está procesando
- `runners.online > 0`: Runner daemon activo
- `runs.fail_rate_last_20 < 0.1`: Menos de 10% fallas
- `backlog.oldest_ready_age_seconds`: Edad de task más vieja (< 86400 = < 24h)

### 2. Runner Status

```bash
curl -s "$API_BASE_URL/ops/runner/status" | jq .
```

**Qué ver**:
- `status: "online"`: Heartbeat reciente (< 60s)
- `last_seen_at`: Timestamp del último heartbeat

### 3. Tasks

```bash
# Ver todas las tasks
curl -s "$API_BASE_URL/ops/tasks" | jq '.data | group_by(.status) | map({status:.[0].status, count:length})'

# Ver solo READY
curl -s "$API_BASE_URL/ops/tasks?status=ready" | jq '.data | length'

# Ver RUNNING
curl -s "$API_BASE_URL/ops/tasks?status=running" | jq '.data[]'
```

### 4. Runs (historial de ejecuciones)

```bash
# Últimos 5 runs
curl -s "$API_BASE_URL/runs" | jq '.data[:5] | .[] | {id,task_id,status,started_at}'

# Detalle de un run específico
curl -s "$API_BASE_URL/runs/<run_id>" | jq .
```

### 5. Directives

```bash
# Ver todas las directivas
curl -s "$API_BASE_URL/ops/directives" | jq '.data[] | {id,title,status}'

# Ver solo PENDING
curl -s "$API_BASE_URL/ops/directives" | jq '.data[] | select(.status=="PENDING")'
```

---

## Flujo Completo End-to-End

```bash
# 1. Ejecutar GPT (crea directivas + tasks)
curl -X POST "$API_BASE_URL/ops/gpt/run" -d '{"environment":"production"}' | jq .

# 2. Verificar que se crearon tasks READY
curl -s "$API_BASE_URL/ops/tasks?status=ready" | jq '.data | length'

# 3. Arrancar runner (si no está corriendo)
./scripts/runner_daemon.sh start

# 4. Monitorear ejecución
watch -n 5 'curl -s "$API_BASE_URL/ops/metrics" | jq "{tasks:.data.tasks, runners:.data.runners}"'

# 5. Ver runs creados
curl -s "$API_BASE_URL/runs" | jq '.data[0:3]'
```

---

## Troubleshooting

### Runner no procesa tasks

**Síntomas**: `tasks.ready > 0` pero `tasks.running = 0`

**Diagnóstico**:
1. Verificar runner status: `curl "$API_BASE_URL/ops/runner/status"`
   - Si `status: "offline"`: Runner no está corriendo → `./scripts/runner_daemon.sh start`
2. Verificar logs: `./scripts/runner_daemon.sh logs`
   - Buscar errores de claim (409 = ya claimed, deps no cumplidas)
3. Verificar deps: Tasks con `depends_on` no se ejecutan hasta que deps estén done

### Tasks stuck en RUNNING

**Síntomas**: `tasks.running > 0` por más de 15 min

**Causa**: Runner se cayó sin marcar task como done/failed

**Solución**: El sweep anti-stuck requequeará automáticamente (cada ~100s). Si no:
```bash
# Requeue manual
curl -X POST "$API_BASE_URL/ops/tasks/<task_id>/requeue" -d '{"backoff_seconds":10}'
```

### GPT no crea directives

**Síntomas**: `POST /ops/gpt/run` devuelve error o 0 directives

**Diagnóstico**:
1. Verificar REQ-009: `curl "$API_BASE_URL/ops/requests" | jq '.data[] | select(.id=="REQ-009")'`
   - Si `status: "WAITING"`: Cargar OPENAI_API_KEY en panel (#/setup)
2. Verificar logs de Render (dashboard)
3. Verificar que el vault tiene la key: `./scripts/load_vault_env.sh && echo $OPENAI_API_KEY`

### Métricas muestran fail_rate alto

**Síntomas**: `runs.fail_rate_last_20 > 0.2` (> 20% fallas)

**Diagnóstico**:
1. Ver últimos runs: `curl "$API_BASE_URL/runs" | jq '.data[] | select(.status=="failed")'`
2. Ver steps del run fallido: `curl "$API_BASE_URL/runs/<run_id>" | jq .data.steps`
3. Revisar last_error en tasks: `curl "$API_BASE_URL/ops/tasks" | jq '.data[] | select(.last_error != null)'`

---

## Panel Web

Acceder a https://elruso.vercel.app

**Secciones**:
- **Runs**: Historial de ejecuciones con steps y file_changes
- **Tasks**: Backlog con filtros por status
- **Runners**: Estado online/offline con heartbeat
- **Directives**: Instrucciones de GPT (PENDING/APPLIED/REJECTED)
- **Requests**: Credenciales y su status (PROVIDED/WAITING)
- **Setup**: Wizard para cargar credenciales en vault

---

## Comandos Rápidos (Cheatsheet)

```bash
# Health check completo
curl -s "$API_BASE_URL/health" && echo " ✓ API healthy"
curl -s "$API_BASE_URL/ops/metrics" | jq '{tasks:.data.tasks,runners:.data.runners}'

# Ejecutar GPT
curl -X POST "$API_BASE_URL/ops/gpt/run" -d '{"environment":"production"}'

# Runner daemon
./scripts/runner_daemon.sh start
./scripts/runner_daemon.sh status
./scripts/runner_daemon.sh logs
./scripts/runner_daemon.sh stop

# Ver backlog
curl -s "$API_BASE_URL/ops/tasks?status=ready" | jq '.data | length'

# Ver último run
curl -s "$API_BASE_URL/runs" | jq '.data[0] | {id,task_id,status,started_at}'

# Ver runners online
curl -s "$API_BASE_URL/ops/runner/status" | jq '.data[] | select(.status=="online")'
```

---

## Mantenimiento

### Migraciones DB

Cuando hay nuevas migraciones en `db/migrations/`:

```bash
# Local
./scripts/db_migrate.sh

# Verificar en prod (la API auto-migra en deploy, pero si no)
# Conectar a Supabase SQL Editor y ejecutar SQL manualmente
```

### Deploy Manual

Normalmente auto-deploy en push a main. Para forzar:

```bash
# API (Render) - auto-deploy configurado
git push origin main

# Panel (Vercel) - auto-deploy configurado
git push origin main

# Verificar deploys
curl -s https://elruso.onrender.com/health
curl -s https://elruso.vercel.app/ | grep -o "<title>.*</title>"
```

---

## Archivos Clave

- `/ops/GPT_CONTEXT.md`: Contexto permanente para GPT
- `/ops/TASKS.json`: Bootstrap de tasks (sync con DB via ops_sync_push.sh)
- `/ops/REQUESTS.json`: Definición de credenciales requeridas
- `/ops/DECISIONS.md`: Decisiones arquitectónicas
- `/scripts/runner_daemon.sh`: Runner 24/7
- `/scripts/compose_gpt_prompt.sh`: Generador de prompt para GPT (usado por API)
- `~/.elruso/vault/`: Credenciales locales (NO en git)

---

**Última actualización**: 2026-02-13
**Motor 24/7**: ✅ OPERACIONAL
**GPT end-to-end**: ✅ FUNCIONAL
