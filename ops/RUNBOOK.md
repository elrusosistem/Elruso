# Runbook - Elruso

## Setup Inicial

```bash
# Clonar e instalar
git clone <repo-url> && cd elruso
pnpm install

# Copiar variables de entorno
cp .env.example apps/api/.env
cp .env.example apps/worker/.env
# Editar con valores reales
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

```bash
./scripts/db_migrate.sh
# Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
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
