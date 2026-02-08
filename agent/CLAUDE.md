# CLAUDE.md - Elruso Stock System

## Proyecto
Sistema de gestión de stock con integración Tiendanube. Monorepo con pnpm.

## Estructura
```
/apps/api        → Fastify + TS (puerto 3001)
/apps/worker     → Jobs + cron + reconciliación
/apps/web        → Vite + React + TS + Tailwind (puerto 3000)
/packages/types  → Tipos compartidos
/ops             → Memoria del sistema (docs, requests, tasks, decisiones)
/scripts         → CLI reproducible
```

## Comandos Rápidos
```bash
pnpm install          # Instalar dependencias
pnpm dev:api          # Dev API
pnpm dev:web          # Dev frontend
pnpm dev:worker       # Dev worker
pnpm build            # Build todo
pnpm test             # Tests todo
./scripts/dev.sh      # Dev completo
./scripts/test.sh     # Tests completo
```

## Reglas para el Agente

### ANTES de escribir código
1. Leer `/ops/DIRECTIVES.md` para las reglas duras
2. Leer `/ops/TASKS.json` para saber qué tarea tomar
3. Verificar `/ops/REQUESTS.json` por bloqueos (status WAITING)

### AL escribir código
1. Crear branch `task/T-xxx` para cada tarea
2. Tests mínimos: health + happy path
3. No commitear secrets. Solo `.env.example`
4. Idempotencia en webhooks: `event_id` + hash payload
5. Source of truth de stock: nuestro sistema, no Tiendanube
6. No tocar precios, solo stock
7. Commits con formato convencional: `feat:`, `fix:`, `chore:`, `docs:`

### SI falta algo (key, token, decisión)
1. Crear entry en `/ops/REQUESTS.json` con status `WAITING`
2. Frenar esa tarea
3. Continuar con la próxima tarea disponible

### AL terminar una tarea
1. Actualizar `/ops/TASKS.json` (status → done)
2. Crear PR con: Summary, Files changed, How to verify
3. Deploy staging automático

### NUNCA
- Commitear `.env` o secrets
- Leer stock de Tiendanube como fuente de verdad
- Tocar precios
- Deployar a producción sin indicación explícita
- Preguntar por chat; usar REQUESTS.json

## Stack
Ver `/ops/STACK.md`

## Arquitectura
Ver `/ops/ARCH.md`

## Variables de Entorno
Ver `/ops/ENVIRONMENT.md` y `.env.example`
