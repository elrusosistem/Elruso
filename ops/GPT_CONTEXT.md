# GPT_CONTEXT.md — Canon Permanente de El Ruso

> Este archivo es la fuente de verdad del proyecto. Leer SIEMPRE al iniciar sesión.
> Última actualización: 2026-02-08

---

## Qué es El Ruso

Sistema orquestador **GPT ↔ Claude** para construir software production-ready y comercializable.

**Producto final**: gestión de stock con integración Tiendanube — un SaaS para e-commerce.

**Motor interno**: pipeline automatizado donde GPT diseña, Claude ejecuta, y el Humano opera.

---

## Roles

| Rol | Responsabilidad | Herramienta |
|---|---|---|
| **GPT** | Arquitectura, auditoría, directivas, roadmap | Chat + compose_gpt_prompt.sh |
| **Claude** | Ejecución CLI, código, tests, commits, runs | Terminal + agent/CLAUDE.md |
| **Humano** | Operador: provee credentials, aprueba PRs, verifica panel | Panel web + REQUESTS.json |

---

## Reglas Duras (no negociables)

1. **Todo por CLI** — nada manual en dashboards, todo scripteable y reproducible
2. **Secretos nunca al repo** — solo `.env.example` con placeholders; valores reales en REQUESTS.json → `.env` local → env vars en deploy
3. **REQUESTS.json es el canal** — si falta un token/key/decisión, crear entry con status WAITING. No preguntar por chat
4. **Source of truth de stock**: nuestro sistema, nunca Tiendanube
5. **No tocar precios** — solo stock (cantidades)
6. **CI verde obligatorio** — build + tests deben pasar antes de commit
7. **Runs como registro** — cada ejecución significativa se registra en reports/runs/ y (con DB) en run_logs
8. **TASKS.json es el backlog** — toda tarea nace ahí, se trackea ahí
9. **Idioma**: español en toda comunicación y documentación

---

## Stack Fijo

| Capa | Tecnología | Deploy |
|---|---|---|
| Backend API | Fastify + TypeScript | Render |
| Worker | Node.js + TypeScript | Render |
| Frontend Panel | Vite + React + TypeScript + Tailwind | Vercel |
| Base de datos | Supabase (PostgreSQL) | Supabase Cloud |
| CI/CD | GitHub Actions | GitHub |
| Runtime | Node.js 22 LTS | .nvmrc + .tool-versions |
| Package manager | pnpm 9 | pnpm-workspace.yaml |
| Migraciones | psql directo (scripts/db_migrate.sh) | CLI |

---

## Estructura del Monorepo

```
/apps/api        → Fastify API (puerto 3001)
/apps/worker     → Jobs, cron, reconciliación
/apps/web        → Panel React (puerto 3000, proxy a API)
/packages/types  → Tipos TypeScript compartidos
/ops             → Memoria del sistema (canon, estado, tasks, requests, decisiones)
/agent           → Directivas para Claude (CLAUDE.md)
/scripts         → CLI scripts reproducibles
/db/migrations   → SQL para psql (NNN_descripcion.sql)
/reports         → Runs, daily digest, prompts GPT
```

---

## Roadmap Oficial (Pasos 0–6)

| Paso | Título | Estado |
|---|---|---|
| **0** | Bootstrap monorepo + /ops + scripts + CI + recorder + panel + bridge | **DONE** |
| **1** | Stock core: DB tables (stock_entries, stock_movements) + engine + API | BLOCKED (REQ-001, REQ-005) |
| **2** | Tiendanube: OAuth + webhooks + sync push | BLOCKED (REQ-001) |
| **3** | Worker: polling, ejecución, retry, reconciliación automática | BLOCKED (REQ-001) |
| **4** | Frontend: panel de stock, logs, movimientos | BLOCKED (REQ-001, REQ-003) |
| **5** | Runner 24/7: loop automático tasks → ejecución → PRs → staging | BLOCKED (REQ-001, REQ-002, REQ-004) |
| **6** | Hardening: rate limit, auth panel, backups, alertas | BLOCKED (REQ-001, REQ-002, REQ-003) |

---

## Pipeline Orquestador

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

---

## Formatos Obligatorios

### RUN SUMMARY (al terminar cualquier ejecución)

```
## Run Summary
- **Task**: T-XXX
- **Status**: done | failed | blocked
- **Branch**: task/T-XXX o main
- **Commit**: <hash corto>
- **Changes**: lista de archivos modificados
- **Next**: qué sigue o qué bloquea
```

### REQUESTS (cuando falta algo)

```json
{
  "id": "REQ-XXX",
  "service": "nombre",
  "type": "credentials | api_token | connection_string | repository",
  "scopes": ["VAR_NAME"],
  "purpose": "para qué se necesita",
  "where_to_set": "dónde configurarlo",
  "validation_cmd": "comando para verificar",
  "status": "WAITING"
}
```

---

## Archivos Clave (leer siempre)

| Archivo | Propósito |
|---|---|
| `/ops/GPT_CONTEXT.md` | Este archivo — canon permanente |
| `/ops/STATE.md` | Estado vivo — HEAD, paso actual, blockers |
| `/ops/TASKS.json` | Backlog completo con dependencias |
| `/ops/REQUESTS.json` | Credentials/tokens pendientes |
| `/ops/DECISIONS.md` | Decisiones arquitectónicas tomadas |
| `/ops/DIRECTIVES_INBOX.json` | Directivas de GPT pendientes |
| `/ops/DIRECTIVES_SCHEMA.json` | Schema de directivas |
| `/ops/RUNBOOK.md` | Cómo ejecutar todo |
| `/agent/CLAUDE.md` | Directivas para Claude |
