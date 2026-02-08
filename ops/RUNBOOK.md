# Runbook - Elruso

## Requisitos

- **Node.js 22 LTS** (`node -v` → `v22.x.x`)
  - Usar `.nvmrc` o `.tool-versions` para fijar la versión
  - `nvm use` o `asdf install` según tu gestor
- **pnpm >= 9** (`pnpm -v`)
- **psql** (cliente PostgreSQL, para migraciones)
  - macOS: `brew install libpq && brew link --force libpq`
  - Ubuntu: `sudo apt-get install postgresql-client`

## Setup Inicial

```bash
# Clonar e instalar
git clone <repo-url> && cd elruso
node -v   # Verificar: debe ser v22.x.x
pnpm install

# Copiar variables de entorno
cp .env.example apps/api/.env
cp .env.example apps/worker/.env
# Editar con valores reales (incluir DATABASE_URL)
```

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
export DATABASE_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres"

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
touch db/migrations/001_create_stock_tables.sql
# Escribir SQL, luego ejecutar ./scripts/db_migrate.sh
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

## Troubleshooting

### API no responde
1. Verificar logs: `render logs --service elruso-api-staging`
2. Verificar health: `curl https://<api-url>/health`
3. Verificar variables de entorno en Render dashboard

### Worker no procesa tasks
1. Verificar logs: `render logs --service elruso-worker-staging`
2. Verificar que SUPABASE_SERVICE_ROLE_KEY esté configurada
3. Verificar tabla `tasks` en Supabase

### Webhooks no llegan
1. Verificar que el webhook esté registrado en Tiendanube
2. Verificar logs de la API para requests entrantes
3. Verificar tabla `webhook_events` para duplicados
