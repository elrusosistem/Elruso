# Changelog

Registro de deploys y cambios del sistema El Ruso.

---

## 2026-02-15 — feat: Runner ejecuta tareas reales (Modos A & B)

### Resumen
El runner ahora ejecuta steps reales de las tasks en vez de solo 3 comandos diagnosticos hardcodeados. Usa un executor Node.js (`scripts/executor.mjs`) que soporta dos modos: Modo A (steps explicitos con `{name, cmd}`) y Modo B (handlers builtin por `task_type`). Los campos `task_type`, `steps` y `params` se persisten en DB y se propagan desde directivas GPT. El bloque FIX C (pre-validacion que auto-fallaba tasks de directivas) fue eliminado — el executor ahora se encarga.

### Archivos nuevos
- `db/migrations/018_task_execution_columns.sql` — agrega task_type (TEXT), steps (JSONB), params (JSONB) a ops_tasks con defaults seguros
- `scripts/executor.mjs` — motor de ejecucion Node.js. Modo A: steps con {name, cmd}. Modo B: handler por task_type (echo, shell). Sin match → no_actionable_steps
- `scripts/__tests__/executor.test.mjs` — 28 tests unitarios del executor

### Archivos modificados
- `apps/api/src/routes/ops.ts` — TaskEntry interface + persistir task_type/steps/params en POST /ops/tasks y directive apply handler
- `scripts/runner_local.sh` — integrar executor.mjs, eliminar FIX C (pre-validacion), eliminar diagnosticos hardcodeados, telemetria task_started/step_started/step_finished/task_finished

### Impacto funcional
- Tasks con steps `[{name, cmd}]` se ejecutan en orden (Modo A)
- Tasks con `task_type` conocido (echo, shell) generan steps automaticamente (Modo B)
- Tasks sin steps ni handler → `no_actionable_steps` via executor (ya no requiere FIX C)
- Guardrail NOOP sigue funcionando: before_sha==after_sha sin custom steps → FAILED
- Telemetria granular: task_started, step_started, step_finished, task_finished en decisions_log

### Riesgos / TODOs
- Migration 018 debe aplicarse en Supabase antes de que GPT envie tasks con steps/params
- Tasks existentes (task_type=generic, steps=[], params={}) siguen funcionando (NOOP si no cambian nada)
- Handlers builtin: solo "echo" y "shell" por ahora — agregar mas segun necesidad

### Verificacion
- 28/28 executor tests passed
- 121/121 vitest tests passed (0 broken)
- types build OK, api build OK
- bash syntax check passed

---

## 2026-02-15 — Hardening: directive apply dedup + observability + DB constraint

### Causa raiz
Migration 013 creo un `UNIQUE INDEX` global sobre `task_hash` en `ops_tasks`.
Esto bloqueaba tasks de directivas NUEVAS si GPT generaba contenido similar a tasks
existentes de directivas anteriores. Resultado: `tasks_created: 0, tasks_skipped: N` sin
feedback visible para el operador.

### Que cambio

**DB (migration 017)**:
- DROP del indice global `idx_ops_tasks_task_hash`
- CREATE `UNIQUE(directive_id, task_hash)` — dedup solo intra-directiva
- Tasks sin directive_id (seed/manual) no sujetas a dedup

**Backend (`ops.ts` apply handler)**:
- Dedup cross-directive ELIMINADO — cada plan aprobado crea sus tasks
- Dedup intra-directive: in-memory `Set<hash>` + DB UNIQUE constraint
- task_id collision: retry loop (max 3 intentos) con generacion de nuevo ID
- Telemetria completa (7 decision_keys):
  - `directive_apply_started` (tasks_count_expected)
  - `task_planned` (task_id, directive_id, title, task_hash)
  - `task_inserted` (task_id, directive_id)
  - `task_skipped_dedup_intra_directive` (task_hash, reason)
  - `task_id_collision` (old_task_id, new_task_id, attempt)
  - `task_insert_error` (error, code)
  - `directive_apply_finished` (tasks_created, tasks_skipped, collisions_count, duration_ms)
- `directive_apply_finished` SIEMPRE se emite (try/finally)

**Panel (`DirectivesList.tsx`)**:
- Feedback real del apply en modo operador (no mas mensaje estatico)
- Boton retry para estado APPROVED
- Spinner durante el proceso

**Tests** (42 en directive_v1.test.ts, 119 total):
- Cross-directive: same tasks in 2 directives → different hashes → both created
- Intra-directive dedup: duplicate tasks → same hash → skipped
- task_id collision: different content → different hash → new ID generated
- Zero-created scenario: explicit reason in hash comparison

### Garantias nuevas
1. UNIQUE(directive_id, task_hash) en DB — concurrencia segura
2. Ningun skip silencioso — todo queda en decisions_log
3. `directive_apply_finished` SIEMPRE se emite (try/finally)
4. Retry automatico en colision de task_id (max 3)

### Como verificar
```bash
# Ver telemetria de un apply
curl -s "https://elruso.onrender.com/ops/decisions?limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-Project-Id: $PROJECT_ID" | \
  python3 -c "import json,sys; [print(d['decision_key']) for d in json.load(sys.stdin).get('data',[]) if 'directive' in d.get('decision_key','') or 'task_' in d.get('decision_key','')]"

# Esperado para un apply exitoso con N tasks:
# directive_apply_started
# task_planned (x N)
# task_inserted (x N)
# directive_apply_finished → tasks_created_count: N, duration_ms: X
```

### Archivos tocados
- `db/migrations/017_fix_task_hash_dedup_scope.sql` — nueva migracion
- `apps/api/src/routes/ops.ts` — apply handler hardened
- `apps/api/src/__tests__/directive_v1.test.ts` — 10 tests nuevos
- `apps/web/src/pages/DirectivesList.tsx` — feedback panel
- `docs/CHANGELOG.md` — este archivo
- `docs/KNOWLEDGE.md` — documentacion de garantias

---

## 2026-02-15 — Activity Stream narrativo
**Commit**: `c4e407f`

### Resumen
Stream de actividad inteligente que transforma eventos tecnicos (decisions_log) en narrativas legibles para humanos no-tecnicos. Timeline vertical en dashboard con agrupacion temporal y colores por tipo.

### Archivos nuevos
- `apps/api/src/activity/activityBuilder.ts` — funcion pura buildActivityStream: filtra (excluye heartbeats/patches), agrupa consecutivos <60s, pluraliza narrativas
- `apps/api/src/routes/activity.ts` — GET /ops/activity?limit=50, scoped por project_id, redacta raw con redactPatterns
- `apps/api/src/__tests__/activity.test.ts` — 5 tests unitarios (filtrado, agrupacion, no-group diferente key, no-group >60s, mapping narrativa/type)
- `apps/web/src/components/ActivityStream.tsx` — timeline vertical con dots coloreados (plan=violet, task=cyan, run=green, error=red, system=slate), modo tecnico expandible

### Archivos modificados
- `packages/types/src/index.ts` — tipos ActivityEvent + ActivityEventType
- `apps/api/src/server.ts` — import y registro de activityRoutes
- `apps/web/src/pages/Dashboard.tsx` — import ActivityStream, integrado como SectionBlock despues del action feedback

### Impacto funcional
- Dashboard operador muestra timeline narrativa en vez de eventos crudos
- Heartbeats y patches filtrados automaticamente
- Eventos repetidos agrupados ("Se crearon 3 tareas" en vez de 3 lineas)
- Modo tecnico: boton "ver detalles" expande JSON (decision_key + raw redactado)

### Riesgos / TODOs
- Ninguno critico. El endpoint es read-only (GET), no modifica datos.
- Si aparecen decision_keys no mapeados, se muestra el key crudo como fallback.

### Verificacion
- `pnpm --filter @elruso/types build` — OK
- `pnpm --filter @elruso/api build` — OK
- `pnpm --filter @elruso/api test` — 109 tests pass (5 nuevos)
- `pnpm --filter @elruso/web build` — OK

---

## 2026-02-15 — Directive apply feedback + task_id collision
**Commit**: `993bc47`

- Fix feedback visual al aplicar directivas
- Resolucion de colisiones de task_id al crear tareas desde directivas

---

## 2026-02-15 — Tour guiado + modal ver proyecto
**Commit**: `256b231`

- Tour interactivo de onboarding con 10 pasos
- Modal para ver detalle de proyecto seleccionado

---

## 2026-02-15 — UI 2026 redesign completo
**Commit**: `0cd97a7`

- Glassmorphism, sidebar navigation, glow effects, animaciones
- Sistema de diseno ui2026: PageContainer, HeroPanel, GlassCard, GlowButton, MetricCard, SectionBlock, StatusPill, AnimatedFadeIn, Tooltip2026

---

## 2026-02-14 — Runner fixes (3 commits)
**Commits**: `d036629`, `a2127d8`, `ed5010c`

- Runner status/metrics scoped por project_id
- runner_id fijo por hostname (no por PID)
- Auto-cleanup heartbeats stale (ghost offline entries)

---

## 2026-02-14 — VM control desde panel
**Commits**: `02e9c61`, `d2d82f8`, `7c12f90`

- GCP Compute API: start/stop/reset VM desde panel
- Progress bar en tiempo real
- Heartbeat fix durante backoff
- Fix bash 'local' keyword fuera de funcion

---

## 2026-02-14 — FASE 4: Perfiles + Projects + Wizard
**Commits**: `f134020`, `efacb48`, `e7a0dd3`, `d906c6d`

- Perfiles: open, tiendanube (2 requests), waba (7+3 requests)
- Perfil inmutable al crear proyecto
- Wizard multi-perfil scoped por proyecto
- DELETE /ops/projects/:id con cascade
- Validadores WABA (formato + token Graph API)
- FAQ WhatsApp, Help page
- Migrations 015-016

---

## 2026-02-14 — FASE 3: Multi-tenant
**Commits**: `d905141`, `a3e4964`

- project_id en 10 tablas operativas
- Migration 015: projects table, project_id columns, composite PKs
- projectScope.ts middleware
- Projects CRUD + frontend selector
- Vault namespaced por proyecto
- verify_project_isolation.sh
