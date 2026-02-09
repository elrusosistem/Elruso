# Arquitectura - El Ruso

## Vision General

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐
│   GPT    │────>│  Elruso API  │────>│   Supabase DB  │
│(directivas)    │  (Fastify)   │<────│  (PostgreSQL)  │
└──────────┘     └──────┬───────┘     └───────^────────┘
                        │                      │
                 ┌──────v───────┐              │
                 │  Panel Web   │              │
                 │  (React SPA) │              │
                 └──────────────┘              │
                                               │
                 ┌──────────────┐              │
                 │   Worker     │──────────────┘
                 │  (runner)    │
                 └──────────────┘

┌──────────────────────────────────────────────┐
│  Claude Code (ejecutor CLI)                  │
│  - Recibe tasks del backlog                  │
│  - Escribe codigo, tests, commits            │
│  - Registra runs via API                     │
└──────────────────────────────────────────────┘
```

## Flujo de Orquestacion

### 1. GPT genera directivas

```
compose_gpt_prompt.sh -> genera prompt con:
  - GPT_CONTEXT.md (canon)
  - STATE.md (estado actual)
  - TASKS.json (backlog)
  - REQUESTS.json (pendientes)
  - Ultimos commits
```

GPT responde con directivas JSON (nuevas tasks, cambios de prioridad, decisiones).

### 2. Humano revisa en panel

El panel muestra directivas pendientes, requests, estado de runs.
El humano aprueba, provee credentials, o escala.

### 3. Claude Code ejecuta

```
apply_gpt_directives.sh -> carga directivas a TASKS.json
Claude toma task READY -> ejecuta por CLI
run_agent.sh -> registra run (steps, file_changes, resultado)
```

### 4. Ciclo se repite

El resultado del run alimenta el proximo compose_gpt_prompt.

## Componentes

### API (apps/api)
- **Framework**: Fastify + TypeScript
- **Deploy**: Render (https://elruso.onrender.com)
- **Endpoints**:
  - `GET /health` — health check
  - `GET /runs` — lista de runs
  - `GET /runs/:id` — detalle de run con steps y file_changes
  - `GET /ops/requests` — requests pendientes
  - `POST /ops/validate-setup` — validar vault/DB
  - `POST /ops/deploy/:target` — trigger deploy
  - `POST /ops/exec-script` — ejecutar script del repo

### Panel (apps/web)
- **Framework**: Vite + React + TypeScript + Tailwind
- **Deploy**: Vercel (https://elruso.vercel.app)
- **Proxy**: `/api/*` -> Render via vercel.json
- **Paginas**: Runs, Tasks, Requests, Directives, Setup Wizard

### Worker (apps/worker)
- **Estado**: Placeholder (Paso 5)
- **Futuro**: Runner autonomo que toma tasks, ejecuta, registra runs

### Types (packages/types)
- **Tipos compartidos**: Run, Task, Directive, Request, ApiResponse
- **Build**: `tsc -b` con project references
- **Importante**: `*.tsbuildinfo` en .gitignore (evita builds stale en Render)

## Tablas en Supabase

| Tabla | Proposito |
|---|---|
| `run_logs` | Registro de ejecuciones (task_id, status, branch, commit, summary) |
| `run_steps` | Pasos dentro de cada run (cmd, exit_code, output) |
| `file_changes` | Archivos modificados por run |
| `ops_requests` | Requests de credentials/tokens |
| `ops_tasks` | Backlog de tareas (mirror de TASKS.json) |
| `ops_directives` | Directivas de GPT |
| `decisions_log` | Decisiones arquitectonicas |
| `_migrations` | Control de migraciones SQL |
| `_seed_control` | Control de seeds idempotentes |

## Deploy

| Servicio | Plataforma | Build Command | Start Command |
|----------|------------|---------------|---------------|
| API | Render | `pnpm install --frozen-lockfile && pnpm --filter @elruso/types build && pnpm --filter @elruso/api build` | `node apps/api/dist/server.js` |
| Panel | Vercel | Auto (Vite) | Static |
| Worker | Render | (futuro) | (futuro) |

### Notas de Deploy
- Render usa NODE_VERSION=22 como env var
- Vercel tiene rewrite `/api/:path*` -> `https://elruso.onrender.com/:path*`
- `*.tsbuildinfo` excluido de git para evitar builds corruptos en CI
