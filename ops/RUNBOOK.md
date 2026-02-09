# Runbook - Elruso

## Requisitos

- **Node.js 22 LTS** (`node -v` → `v22.x.x`)
  - Usar `.nvmrc` o `.tool-versions` para fijar la versión
  - `nvm use` o `asdf install` según tu gestor
- **pnpm >= 9** (`pnpm -v`)
- **psql** (cliente PostgreSQL, para migraciones)
  - macOS: `brew install libpq && brew link --force libpq`
  - Ubuntu: `sudo apt-get install postgresql-client`

## Bootstrap Completo (desde cero)

```bash
# 1. Clonar
git clone https://github.com/abisaieg/Elruso.git && cd Elruso

# 2. Verificar requisitos
node -v    # >= 22.x.x
pnpm -v    # >= 9.x.x
psql --version  # necesario para migraciones (brew install libpq && brew link --force libpq)
jq --version    # necesario para scripts ops (brew install jq)

# 3. Instalar dependencias
pnpm install

# 4. Configurar env vars
cp .env.example apps/api/.env
cp .env.example apps/worker/.env
# Editar con valores reales: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL

# 5. Migraciones (requiere DATABASE_URL + psql)
export DATABASE_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"
./scripts/db_migrate.sh

# 6. Seed ops JSON → DB
./scripts/seed_ops_to_db.sh

# 7. Verificar
pnpm -r build            # Build todo
pnpm -r test             # Tests todo
./scripts/update_state.sh  # Regenerar STATE.md
./scripts/ops_sync.sh      # Verificar modo (DB o file-backed)

# 8. Dev
pnpm dev:api    # API en :3001
pnpm dev:web    # Panel en :3000
```

### Validaciones rápidas

```bash
# Git remoto
git remote -v  # origin → https://github.com/abisaieg/Elruso.git

# API health
curl http://localhost:3001/health  # {"ok":true,"data":{"status":"healthy"}}

# Ops endpoints (con API corriendo)
curl http://localhost:3001/ops/requests   # lista requests
curl http://localhost:3001/ops/tasks      # lista tasks
curl http://localhost:3001/ops/directives # lista directives

# DB connectivity (requiere DATABASE_URL)
psql $DATABASE_URL -c 'SELECT 1;'

# Panel rutas
# http://localhost:3000/#/runs
# http://localhost:3000/#/tasks
# http://localhost:3000/#/requests
# http://localhost:3000/#/directives
# http://localhost:3000/#/setup      ← Setup Wizard
```

## Setup Inicial (versión corta)

```bash
git clone https://github.com/abisaieg/Elruso.git && cd Elruso
pnpm install
cp .env.example apps/api/.env
cp .env.example apps/worker/.env
# Editar .env con valores reales
```

## Bootstrap desde Panel (sin terminal para secretos)

El panel arranca sin credenciales. Todo el flujo de setup se hace desde `#/setup`:

```bash
# 1. Levantar dev servers (sin creds, funciona file-backed)
pnpm dev:api    # :3001
pnpm dev:web    # :3000

# 2. Ir al Setup Wizard
# http://localhost:3000/#/setup
```

**Flujo en el panel:**

1. **Supabase** (REQ-001 + REQ-005):
   - Pegar SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY → Guardar
   - Pegar DATABASE_URL → Guardar
   - Validar (check de conectividad sin exponer secretos)
   - Migrar DB → ejecuta `db_migrate.sh`
   - Seed Ops → ejecuta `seed_ops_to_db.sh`

2. **Render** (REQ-002 + REQ-007):
   - Pegar RENDER_API_TOKEN → Guardar
   - Pegar RENDER_API_SERVICE_ID → Guardar
   - Validar token
   - Deploy Staging API → ejecuta `deploy_staging_api.sh`

3. **Vercel** (REQ-003 + REQ-008):
   - Pegar VERCEL_TOKEN → Guardar
   - Pegar VERCEL_PROJECT_ID_WEB → Guardar
   - Validar token
   - Deploy Staging Web → ejecuta `deploy_staging_web.sh`

**Verificación post-setup:**
```bash
# Desde terminal (opcional)
curl http://localhost:3001/ops/requests  # todos PROVIDED
curl http://localhost:3001/health        # healthy

# Desde panel
# #/setup → todos los badges en verde (ok)
# #/requests → todos PROVIDED
# #/tasks → lecturas desde DB (no file-backed)
```

**Seguridad:** Los secretos se guardan en `ops/.secrets/requests_values.json` (gitignored). Nunca se exponen en logs, API responses, ni REQUESTS.json. La validación solo devuelve ok/fail + mensaje corto.

## Desarrollo Local

```bash
# API (puerto 3001)
pnpm dev:api

# Worker
pnpm dev:worker

# Frontend (puerto 3000, proxy a API)
pnpm dev:web

# Todos juntos (en terminales separadas o con tmux)
./scripts/dev.sh
```

## Tests

```bash
# Todos los tests
./scripts/test.sh

# Solo API
pnpm --filter @elruso/api test

# Solo worker
pnpm --filter @elruso/worker test
```

## Lint

```bash
./scripts/lint.sh
```

## Build

```bash
# Todos
pnpm build

# Solo API
pnpm build:api
```

## Migraciones DB

Las migraciones se ejecutan con `psql` directamente contra la base de datos Supabase.

```bash
# Requiere DATABASE_URL (connection string PostgreSQL)
# Obtener de: Supabase Dashboard > Project Settings > Database > Connection string (URI)
export DATABASE_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"

# Ejecutar migraciones pendientes
./scripts/db_migrate.sh

# El script:
# 1. Verifica conectividad con psql
# 2. Crea tabla _migrations (control de versiones, idempotente)
# 3. Ejecuta cada db/migrations/*.sql pendiente dentro de una transacción
# 4. Registra cada migración aplicada en _migrations
# 5. Si una falla, aborta (la transacción hace rollback)
```

### Crear nueva migración

```bash
# Formato: NNN_descripcion.sql (orden lexicográfico)
touch db/migrations/002_ops_tables.sql
# Escribir SQL, luego ejecutar ./scripts/db_migrate.sh
```

### Seed: cargar ops JSON a DB

```bash
# Requiere DATABASE_URL + jq + psql
# Upsert idempotente: REQUESTS.json → ops_requests, TASKS.json → ops_tasks,
# DIRECTIVES_INBOX.json → ops_directives
./scripts/seed_ops_to_db.sh

# El script:
# 1. Lee ops/REQUESTS.json, TASKS.json, DIRECTIVES_INBOX.json
# 2. Hace INSERT ... ON CONFLICT DO UPDATE para cada registro
# 3. Es safe para ejecutar múltiples veces (idempotente)
```

### Flujo DB-first

```
1. Ejecutar migraciones:     ./scripts/db_migrate.sh
2. Seedear datos iniciales:  ./scripts/seed_ops_to_db.sh
3. API detecta DB creds:     lee/escribe de Supabase (ops_requests, ops_tasks, ops_directives)
4. Sin DB creds (dev local): API cae a fallback file-backed (ops/*.json)
```

## Deploy Staging

```bash
# API + Worker (Render)
./scripts/deploy_staging_api.sh

# Web (Vercel)
./scripts/deploy_staging_web.sh
```

## Deploy Producción (SOLO MANUAL)

```bash
# API + Worker (Render) - requiere confirmación
./scripts/deploy_prod_api.sh

# Web (Vercel) - requiere confirmación
./scripts/deploy_prod_web.sh
```

## Rollback

```bash
# Render: rollback al deploy anterior
render rollback --service <service-id>

# Vercel: rollback al deployment anterior
vercel rollback
```

## Run Agent (registro de ejecuciones)

```bash
# Ejecutar un comando y registrar la ejecución completa
./scripts/run_agent.sh <TASK_ID> [comando...]

# Ejemplo: registrar un build
./scripts/run_agent.sh T-013 pnpm -r build

# Solo registrar sin comando (captura estado git)
./scripts/run_agent.sh T-TEST

# El script:
# 1. Captura estado git pre (branch, commit)
# 2. Ejecuta el comando (si se pasa)
# 3. Captura estado git post + diff --stat
# 4. Genera report en reports/runs/<timestamp>_<TASK_ID>.md
# 5. Si DATABASE_URL está configurada, persiste en DB (run_logs, run_steps, file_changes)
# 6. Si no hay DB creds, genera solo el archivo (status: blocked)
```

## Daily Digest

```bash
# Generar resumen de últimas 24h
./scripts/daily_digest.sh

# Output: reports/daily.md
# Lee de DB si hay creds, sino de reports/runs/*.md
```

## Flujo Orquestador (GPT → Claude)

El loop completo del sistema:

```
Humano ──▶ compose_gpt_prompt.sh ──▶ Prompt para GPT
                                         │
GPT responde con directivas JSON ◀───────┘
         │
         ▼
apply_gpt_directives.sh ──▶ DIRECTIVES_INBOX.json + TASKS.json
         │
Claude toma tasks READY ◀──┘
         │
         ▼
run_agent.sh ──▶ Ejecuta + registra run
         │
Panel muestra resultado ◀──┘
```

### 1. Generar prompt para GPT

```bash
./scripts/compose_gpt_prompt.sh
# Output: reports/gpt/prompts/<timestamp>.md
# Copiar contenido y pegar en GPT
```

### 2. Aplicar directivas de GPT

```bash
# GPT responde con JSON. Guardar en:
# reports/gpt/directives/incoming.json

# Aplicar (NO ejecuta nada, solo crea tasks):
./scripts/apply_gpt_directives.sh reports/gpt/directives/incoming.json

# Resultado: directivas en DIRECTIVES_INBOX.json, tasks en TASKS.json
```

### 3. Claude ejecuta tasks

```bash
# Claude toma la siguiente task READY y ejecuta:
./scripts/run_agent.sh T-XXX <comando>
```

### 4. Humano verifica en panel

```
http://localhost:3000/#/runs        → ver ejecuciones
http://localhost:3000/#/tasks       → ver/cambiar estado de tasks
http://localhost:3000/#/directives  → ver/aprobar/rechazar directivas
http://localhost:3000/#/requests    → marcar credentials como provided
```

## Scripts de Mantenimiento

```bash
# Actualizar ops/STATE.md con info live (HEAD, branch, requests, tasks)
./scripts/update_state.sh

# Sincronizar ops JSON ↔ DB
./scripts/ops_sync.sh           # export: DB → ops/*.json (default)
./scripts/ops_sync.sh import    # import: ops/*.json → DB (= seed)
./scripts/ops_sync.sh export    # export explícito

# Sin DB creds, ops_sync.sh sale ok con mensaje informativo (modo file-backed)
```

### Protocolo al finalizar un run

```bash
# 1. Commit cambios
git add <archivos> && git commit -m "feat: ..."

# 2. Actualizar estado
./scripts/update_state.sh
./scripts/ops_sync.sh

# 3. Push
git push origin main
```

---

## Troubleshooting

### API no responde
1. Verificar logs: `render logs --service elruso-api-staging`
2. Verificar health: `curl https://<api-url>/health`
3. Verificar variables de entorno en Render dashboard

### Worker no procesa tasks
1. Verificar logs: `render logs --service elruso-worker-staging`
2. Verificar que SUPABASE_SERVICE_ROLE_KEY este configurada
3. Verificar tabla `ops_tasks` en Supabase

### Build falla en Render
1. Verificar que `*.tsbuildinfo` no este en git (`git ls-files '*.tsbuildinfo'` debe dar vacio)
2. Verificar que `pnpm --filter @elruso/types build` genera `packages/types/dist/index.d.ts`
3. Verificar NODE_VERSION=22 en env vars de Render
