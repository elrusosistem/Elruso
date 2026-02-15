# Changelog

Registro de deploys y cambios del sistema El Ruso.

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
