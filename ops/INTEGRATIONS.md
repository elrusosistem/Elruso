# Integraciones - El Ruso

## Supabase (PostgreSQL)

### Acceso
- **Metodo**: REST API via Supabase JS client (PostgREST)
- **URL**: `SUPABASE_URL` (env var)
- **Auth**: `SUPABASE_SERVICE_ROLE_KEY` para backend, `SUPABASE_ANON_KEY` para frontend
- **Fallback**: Si no hay creds, la API opera en modo file-backed (lee ops/*.json)

### Tablas
| Tabla | Proposito |
|---|---|
| `run_logs` | Ejecuciones registradas |
| `run_steps` | Pasos de cada run |
| `file_changes` | Archivos modificados por run |
| `ops_requests` | Requests de credentials |
| `ops_tasks` | Backlog de tareas |
| `ops_directives` | Directivas de GPT |
| `decisions_log` | Decisiones arquitectonicas |
| `_migrations` | Control de migraciones |
| `_seed_control` | Control de seeds |

### Notas
- Pooler tiene circuit breaker abierto (problema infra Supabase)
- Conexion directa requiere IPv6 (no disponible en red del operador)
- Workaround: REST API para todo via `@supabase/supabase-js`

## Render (Deploy API)

### Acceso
- **API**: `RENDER_API_TOKEN`
- **Service ID**: `RENDER_API_SERVICE_ID`
- **Deploy trigger**: POST a API de Render via scripts

### Build
```
pnpm install --frozen-lockfile && pnpm --filter @elruso/types build && pnpm --filter @elruso/api build
```

### Start
```
node apps/api/dist/server.js
```

## Vercel (Deploy Panel)

### Acceso
- **Token**: `VERCEL_TOKEN`
- **Project ID**: `VERCEL_PROJECT_ID_WEB`
- **Deploy**: Automatico en push a main

### Proxy
`vercel.json` rewrite: `/api/:path*` -> `https://elruso.onrender.com/:path*`

## GitHub

### Repositorio
- **URL**: https://github.com/abisaieg/Elruso (private)
- **Branch principal**: `main`
- **CI**: GitHub Actions (build + test en PRs)
