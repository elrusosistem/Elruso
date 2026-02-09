# GPT_CONTEXT.md — Canon Permanente de El Ruso

> Este archivo es la fuente de verdad del proyecto. Leer SIEMPRE al iniciar sesion.
> Ultima actualizacion: 2026-02-09

---

## Que es El Ruso

Sistema orquestador **GPT <-> Claude Code** para construir software production-ready.

- **GPT** es el arquitecto: define tareas, directivas, roadmap, arquitectura
- **Claude Code** es el ejecutor: escribe codigo, corre tests, hace commits, deploys — todo por CLI
- **El Humano** es el operador: lee el panel, entrega credentials, aprueba produccion

El primer producto que construye El Ruso es **su propia instancia**. Despues se vende como SaaS.

---

## Roles

| Rol | Responsabilidad | Herramienta |
|---|---|---|
| **GPT** | Arquitectura, auditoria, directivas, roadmap | Chat + compose_gpt_prompt.sh |
| **Claude Code** | Ejecucion CLI: codigo, tests, commits, deploys, runs | Terminal + agent/CLAUDE.md |
| **Humano** | Operador: provee credentials, aprueba PRs, verifica panel | Panel web + REQUESTS.json |

---

## Reglas Duras (no negociables)

1. **Todo por CLI** — nada manual en dashboards, todo scripteable y reproducible
2. **Secretos nunca al repo** — solo `.env.example` con placeholders; valores reales via REQUESTS.json -> `.env` local -> env vars en deploy
3. **REQUESTS.json es el canal** — si falta un token/key/decision, crear entry con status WAITING. No preguntar por chat
4. **CI verde obligatorio** — build + tests deben pasar antes de merge
5. **Runs como registro** — cada ejecucion significativa se registra en run_logs (DB) y reports/runs/ (archivos)
6. **TASKS.json es el backlog** — toda tarea nace ahi, se trackea ahi
7. **Idioma**: espanol en toda comunicacion y documentacion
8. **GPT define, Claude ejecuta, Humano aprueba** — sin excepciones

---

## Stack Fijo

| Capa | Tecnologia | Deploy |
|---|---|---|
| Backend API | Fastify + TypeScript | Render |
| Worker | Node.js + TypeScript | Render (futuro) |
| Frontend Panel | Vite + React + TypeScript + Tailwind | Vercel |
| Base de datos | Supabase (PostgreSQL) | Supabase Cloud |
| CI/CD | GitHub Actions | GitHub |
| Runtime | Node.js 22 LTS | NODE_VERSION=22 en Render, .nvmrc |
| Package manager | pnpm 9 | pnpm-workspace.yaml |
| Tipos compartidos | @elruso/types (workspace) | tsc -b con project references |

---

## Estructura del Monorepo

```
/apps/api        -> Fastify API (puerto 3001, deploy Render)
/apps/worker     -> Runner autonomo (futuro, deploy Render)
/apps/web        -> Panel React (deploy Vercel, proxy /api/* -> Render)
/packages/types  -> Tipos TypeScript compartidos (@elruso/types)
/ops             -> Memoria del sistema (canon, estado, tasks, requests, decisiones)
/agent           -> Directivas para Claude (CLAUDE.md)
/scripts         -> CLI scripts reproducibles
/db/migrations   -> SQL para migraciones
/reports         -> Runs, daily digest, prompts GPT
```

---

## Roadmap Oficial (Pasos 0-6)

| Paso | Titulo | Estado |
|---|---|---|
| **0** | Bootstrap monorepo + /ops + scripts + CI + recorder + panel + bridge | **DONE** |
| **1** | Fixes infra: Render build, Vercel proxy, vault local, setup wizard | **DONE** |
| **2** | Memoria real: POST /runs, POST /directives, POST /tasks, migrar scripts de psql a REST | READY |
| **3** | Puente GPT <-> Claude: compose_prompt end-to-end, apply_directives, run_agent | READY |
| **4** | Panel del humano: dashboard estado, requests inbox, runs, diffs, aprobar prod | READY |
| **5** | Runner 24/7: worker autonomo, loop tasks -> ejecucion -> PRs, reintentos, backoff | BLOCKED |
| **6** | Hardening: auth, multi-tenant, auditoria, SLA | BLOCKED |

---

## Pipeline Orquestador

```
Humano --> compose_gpt_prompt.sh --> Prompt para GPT
                                         |
GPT responde con directivas JSON <-------+
         |
         v
apply_gpt_directives.sh --> DIRECTIVES_INBOX.json + TASKS.json
         |
Claude toma tasks READY <--+
         |
         v
run_agent.sh --> Ejecuta + registra run en DB
         |
Panel muestra resultado <--+
```

---

## URLs de Deploy

| Servicio | URL | Estado |
|---|---|---|
| API (Render) | https://elruso.onrender.com | LIVE |
| Panel (Vercel) | https://elruso.vercel.app | LIVE |
| Proxy API | https://elruso.vercel.app/api/* -> Render | LIVE |
| DB (Supabase) | us-east-1 | 9 tablas migradas |

---

## Conexion Supabase

- **Pooler**: circuit breaker abierto (problema infra Supabase, no nuestro)
- **Directa**: solo IPv6, red del operador no soporta
- **Workaround actual**: REST API para todo (reads y writes via Supabase JS client)
- **Migraciones**: via SQL Editor de Supabase (no psql por ahora)

---

## Formatos Obligatorios

### RUN SUMMARY (al terminar cualquier ejecucion)

```
## Run Summary
- **Task**: T-XXX
- **Status**: done | failed | blocked
- **Branch**: task/T-XXX o main
- **Commit**: <hash corto>
- **Changes**: lista de archivos modificados
- **Next**: que sigue o que bloquea
```

### REQUESTS (cuando falta algo)

```json
{
  "id": "REQ-XXX",
  "service": "nombre",
  "type": "credentials | api_token | connection_string | repository",
  "scopes": ["VAR_NAME"],
  "purpose": "para que se necesita",
  "where_to_set": "donde configurarlo",
  "validation_cmd": "comando para verificar",
  "status": "WAITING"
}
```

---

## Repositorio

- **URL**: https://github.com/abisaieg/Elruso (private)
- **Branch principal**: `main`

---

## Scripts de Mantenimiento

| Script | Proposito |
|---|---|
| `scripts/update_state.sh` | Regenera `ops/STATE.md` con info live (HEAD, requests, tasks) |
| `scripts/ops_sync.sh [export\|import]` | Sincroniza ops JSON <-> DB. Sin creds, sale ok (file-backed) |
| `scripts/seed_ops_to_db.sh` | Upsert idempotente ops/*.json -> tablas ops_* |
| `scripts/db_migrate.sh` | Ejecuta migraciones SQL pendientes |
| `scripts/run_agent.sh <TASK_ID>` | Ejecuta y registra un run |
| `scripts/compose_gpt_prompt.sh` | Genera prompt contextual para GPT |
| `scripts/apply_gpt_directives.sh` | Aplica directivas GPT -> tasks |

---

## Archivos Clave (leer siempre)

| Archivo | Proposito |
|---|---|
| `/ops/GPT_CONTEXT.md` | Este archivo — canon permanente |
| `/ops/STATE.md` | Estado vivo — HEAD, paso actual, blockers |
| `/ops/TASKS.json` | Backlog completo con dependencias |
| `/ops/REQUESTS.json` | Credentials/tokens pendientes |
| `/ops/DECISIONS.md` | Decisiones arquitectonicas tomadas |
| `/ops/DIRECTIVES_INBOX.json` | Directivas de GPT pendientes |
| `/ops/DIRECTIVES_SCHEMA.json` | Schema de directivas |
| `/agent/CLAUDE.md` | Directivas para Claude |
