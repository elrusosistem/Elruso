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

- 119+ tests (vitest), 8 test files
- `directive_v1.test.ts`: 42 tests (schema, validation, hash, dedup guarantees)
- Tests obligatorios para apply:
  - Cross-directive: same tasks → both created
  - Intra-directive dedup: duplicate → skipped
  - task_id collision: → new ID generated
  - Zero-created: → explicit reason in hashes
