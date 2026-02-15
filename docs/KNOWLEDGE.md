# Knowledge Base — El Ruso

Decisiones tecnicas, garantias, y patrones criticos del sistema.

---

## Directive Apply — Dedup y Task Creation

### Regla: NO dedup cross-directives

Cada directiva aprobada DEBE crear sus tasks. La deduplicacion de tasks solo aplica
**dentro de la misma directiva** (intra-directive). Nunca se bloquea una task porque
otra directiva ya creo una task con contenido similar.

### Garantias DB

| Constraint | Scope | Efecto |
|---|---|---|
| `UNIQUE(directive_id, task_hash)` | intra-directive | Previene tasks duplicadas dentro del mismo plan |
| `task_hash` nullable | tasks sin directive | Tasks manuales/seed no sujetas a dedup |

**Migration**: 017_fix_task_hash_dedup_scope.sql

### Dedup por task_hash

`taskHash()` en `contracts/directive_v1.ts` calcula SHA-256 sobre:
- `task_type` (default "generic")
- `title`
- `steps`
- `params`
- `directive_objective` (el objetivo de la directiva, no de la task)

El `directive_objective` difiere entre directives, asi que tasks identicas en
directives distintas producen hashes diferentes → no se deduplicanplan.

### Colision de task_id

Si GPT genera un `task_id` que ya existe (ej: "T-GPT-001"):
1. Se detecta la colision
2. Se genera nuevo ID: `T-GPT-{timestamp}-{random}`
3. Se reintenta (max 3 veces)
4. Se loguea `task_id_collision` en decisions_log

### Telemetria obligatoria (decisions_log)

Todo apply emite esta cadena de eventos:

```
directive_apply_started       → {directive_id, tasks_count_expected}
  task_planned                → {task_id, directive_id, title, task_hash}      (por cada task)
  task_inserted               → {task_id, directive_id}                        (si insert OK)
  task_skipped_dedup_intra    → {task_id, directive_id, task_hash, reason}     (si duplicada)
  task_id_collision           → {old_task_id, new_task_id, attempt}            (si colision)
  task_insert_error           → {task_id, error, code}                         (si error DB)
directive_apply_finished      → {tasks_created, tasks_skipped, collisions_count, duration_ms}
```

`directive_apply_finished` SIEMPRE se emite (try/finally), incluso si hubo error.

### Anti-patron: dedup global

**PROHIBIDO**: nunca agregar un indice o query que deduplicase tasks por `task_hash`
sin filtrar por `directive_id`. Esto fue la causa raiz del bug "0 tasks created"
(migration 013 lo hacia).

---

## Panel — Modo Operador

### Feedback de apply

En modo operador (`isOp`), el boton "Aprobar y ejecutar":
1. PATCH status → APPROVED
2. POST /apply → crea tasks
3. Muestra resultado real: tasks creadas, skipped, errores, bloqueos
4. Si queda en APPROVED (apply fallo), muestra boton "Reintentar aplicar"

**Anti-patron**: nunca mostrar mensaje estatico como "Las tareas se estan creando"
sin verificar el resultado real del apply.

---

## Conexion Supabase

- DB es Source of Truth, todo por CLI
- psql directo puede ser inestable (IPv6/pooler)
- DDL/Migraciones: SQL Editor o psql, versionado en repo, registrar en `_migrations`
- DML/Sync: siempre por REST o endpoints internos

---

## Tests

- 130 tests (vitest), 8 test files
- `directive_v1.test.ts`: 51 tests (schema, validation, hash, dedup guarantees, planner guardrails)
- Tests obligatorios para apply:
  - Cross-directive: same tasks → both created
  - Intra-directive dedup: duplicate → skipped
  - task_id collision: → new ID generated
  - Zero-created: → explicit reason in hashes
- Tests guardrails planner:
  - Product con 4 tasks + acceptance → OK
  - Product con 1 task → FAIL (minimo 4)
  - Product sin acceptance → FAIL
  - Product sin steps → FAIL
  - Product con scope infra → FAIL (scope_violation)
  - String steps rechazados por schema

---

## Planner Guardrails (directive_v1.ts)

### Scope Classification
- `scope_type=product`: features UI, paginas, componentes, endpoints de negocio
  - `allowed_scope` SOLO: `apps/web/**`, `apps/api/src/routes/**`, `packages/types/**`
  - PROHIBIDO: `scripts/**`, `db/migrations/**`, executor, runner
  - MINIMO 4 tasks (scaffold, implementacion, integracion, build/verificacion)
- `scope_type=infra`: runner, executor, migrations, scripts, CI/CD
  - Sin minimo de tasks
- `scope_type=mixed`: genuinamente requiere ambos (raro)

### Steps Ejecutables (obligatorio)
- `steps` DEBE ser array de `{name, cmd}` — NO strings descriptivos
- Schema valida con `ExecutableStepSchema`: `z.object({ name, cmd })`
- Strings en steps → rechazado por zod schema

### Acceptance (obligatorio para producto)
- `acceptance.expected_files`: archivos que DEBEN existir al finalizar
- `acceptance.checks`: comandos que DEBEN pasar (exit 0)
- Falta acceptance en product → `planner_guardrail_failed`

### Validacion (validateScope)
La funcion `validateScope()` en `directive_v1.ts` valida ANTES de aceptar la directiva:
1. Product con <4 tasks → rechazado
2. Product sin acceptance → rechazado
3. Product sin steps → rechazado
4. Product con allowed_scope de infra → `scope_violation`

---

## Runner Task Execution

### Columnas en ops_tasks (migration 018)

| Columna | Tipo | Default | Descripcion |
|---|---|---|---|
| `task_type` | TEXT | `'generic'` | Tipo de task (generic, echo, shell) |
| `steps` | JSONB | `'[]'` | Steps ejecutables `[{name, cmd}, ...]` |
| `params` | JSONB | `'{}'` | Parametros para handlers builtin |

### Persistencia

- **POST /ops/tasks**: acepta `task_type`, `steps`, `params` en body
- **POST /ops/directives/:id/apply**: persiste estos campos desde `tasks_to_create` de la directiva
- **POST /ops/tasks/claim**: devuelve los 3 campos en el response (select *)

### Executor (`scripts/executor.mjs`)

Motor de ejecucion Node.js invocado por el runner como subprocess.

**Input** (JSON via stdin):
```json
{ "task_id": "...", "task_type": "echo", "steps": [], "params": {}, "project_root": "/path" }
```

**Output** (JSON via stdout):
```json
{ "ok": true, "mode": "A|B", "results": [{ "name", "cmd", "exit_code", "output", "duration_ms" }] }
```

**Modos de resolucion**:
1. **Modo A**: si `steps` contiene objetos `{name, cmd}`, ejecuta cada uno en orden
2. **Modo B**: si no hay steps ejecutables, busca handler por `task_type`
3. Sin match → `{ ok: false, error: "no_actionable_steps" }`

**Handlers builtin**:
- `echo` — crea archivo con `params.message` en `params.filepath` (demo E2E)
- `shell` — ejecuta `params.commands[].cmd` directamente

**Comportamiento**:
- Se detiene al primer step que falla (exit_code != 0)
- Output truncado a 500 chars por step
- Timeout de 30s por step
- Siempre exit 0, resultado como JSON

### Runner integration

El runner (`scripts/runner_local.sh`) invoca el executor en cada task:
1. Extrae `task_type`, `steps`, `params` del claim response
2. Construye JSON input con jq
3. Invoca: `echo "$input" | node scripts/executor.mjs`
4. Parsea resultado y registra cada step via API
5. Guardrail NOOP sigue funcionando: si `custom_steps_ran=false` y `before_sha==after_sha` → FAILED

### Telemetria (decisions_log)

```
task_started    → {task_id, task_type}
step_started    → {task_id, step_name, step_index}
step_finished   → {task_id, step_name, step_index, exit_code, duration_ms}
task_finished   → {task_id, status, custom_steps_ran, steps_count}
```
