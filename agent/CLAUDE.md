# CLAUDE.md - El Ruso (Orquestador GPT <-> Claude)

## Al Comenzar (OBLIGATORIO)

Leer estos archivos antes de hacer cualquier cosa:

1. `/ops/GPT_CONTEXT.md` — canon permanente del proyecto (roles, reglas, stack, roadmap)
2. `/ops/STATE.md` — estado vivo (HEAD, paso actual, blockers, proximo objetivo)
3. `/ops/TASKS.json` — backlog completo con dependencias y estados
4. `/ops/REQUESTS.json` — credentials/tokens pendientes (status WAITING = bloqueante)

## Al Terminar Cualquier Cambio (OBLIGATORIO)

1. Ejecutar `./scripts/update_state.sh` — regenera `/ops/STATE.md` automaticamente
2. Ejecutar `./scripts/ops_sync.sh` — sincroniza ops JSON <-> DB (si hay creds, export DB->JSON; sin creds, sale ok)
3. Actualizar `/ops/TASKS.json` si cambio el estado de alguna task
4. Generar RUN SUMMARY en `reports/runs/<timestamp>_<TASK_ID>.md` (o usar `./scripts/run_agent.sh`)

---

## Proyecto

El Ruso es un sistema orquestador que conecta GPT (arquitecto) con Claude Code (ejecutor).
GPT define directivas, tareas y arquitectura. Claude las ejecuta por CLI. El Humano opera el panel.

## Estructura
```
/apps/api        -> Fastify + TS (puerto 3001, deploy Render)
/apps/worker     -> Runner autonomo (futuro)
/apps/web        -> Vite + React + TS + Tailwind (deploy Vercel)
/packages/types  -> Tipos compartidos (@elruso/types)
/ops             -> Memoria del sistema (docs, requests, tasks, decisiones)
/scripts         -> CLI reproducible
```

## Comandos Rapidos
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

### ANTES de escribir codigo
1. Leer `/ops/DIRECTIVES.md` para las reglas duras
2. Leer `/ops/TASKS.json` para saber que tarea tomar
3. Verificar `/ops/REQUESTS.json` por bloqueos (status WAITING)

### AL escribir codigo
1. Crear branch `task/T-xxx` para cada tarea
2. Tests minimos: health + happy path
3. No commitear secrets. Solo `.env.example`
4. Commits con formato convencional: `feat:`, `fix:`, `chore:`, `docs:`

### SI falta algo (key, token, decision)
1. Crear entry en `/ops/REQUESTS.json` con status `WAITING`
2. Frenar esa tarea
3. Continuar con la proxima tarea disponible

### AL terminar una tarea
1. Actualizar `/ops/TASKS.json` (status -> done)
2. Crear PR con: Summary, Files changed, How to verify
3. Deploy staging automatico

### NUNCA
- Commitear `.env` o secrets
- Deployar a produccion sin indicacion explicita
- Preguntar por chat; usar REQUESTS.json
- Actuar sin directiva de GPT o instruccion del Humano

## Stack
Ver `/ops/STACK.md`

## Arquitectura
Ver `/ops/ARCH.md`

## Variables de Entorno
Ver `/ops/ENVIRONMENT.md` y `.env.example`
