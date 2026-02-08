# Decisiones Arquitectónicas - Elruso

## DEC-001: Monorepo con pnpm workspaces
- **Fecha**: 2026-02-08
- **Decisión**: Usar pnpm workspaces en lugar de Turborepo/Nx
- **Razón**: Simplicidad. No necesitamos cache de builds distribuido. pnpm workspaces resuelve dependency linking y scripts.

## DEC-002: Stock como source of truth
- **Fecha**: 2026-02-08
- **Decisión**: Nuestro sistema es la fuente de verdad de stock. No leemos stock de Tiendanube.
- **Razón**: Evitar race conditions y desincronización. Tiendanube es solo receptor de actualizaciones.

## DEC-003: Idempotencia por event_id + payload_hash
- **Fecha**: 2026-02-08
- **Decisión**: Cada webhook se deduplica por la combinación de `event_id` (de Tiendanube) + SHA256 del payload.
- **Razón**: Tiendanube puede reenviar webhooks. Necesitamos garantizar procesamiento exactamente una vez.

## DEC-004: Worker con polling (no pub/sub)
- **Fecha**: 2026-02-08
- **Decisión**: El worker pollea la tabla `tasks` en lugar de usar un message broker.
- **Razón**: Menos infraestructura. Supabase Postgres es suficiente como cola de tareas para nuestro volumen.

## DEC-005: Deploys staging automáticos, prod manuales
- **Fecha**: 2026-02-08
- **Decisión**: CI deploya a staging en cada merge a main. Prod solo via script manual con confirmación.
- **Razón**: Staging para validar rápido, prod requiere aprobación explícita del operador.

## DEC-006: Node 22 LTS fijo
- **Fecha**: 2026-02-08
- **Decisión**: Fijar Node 22 LTS en dev (.nvmrc, .tool-versions), CI (setup-node) y prod (engines en package.json).
- **Razón**: Node 22 es la versión LTS activa con soporte hasta abril 2027. Evita incompatibilidades entre entornos y da acceso a APIs estables (fetch nativo, test runner, etc.) sin features experimentales de Node 23+/25+.

## DEC-007: Migraciones con psql directo (no Supabase CLI)
- **Fecha**: 2026-02-08
- **Decisión**: Usar `psql` contra `DATABASE_URL` para ejecutar migraciones SQL, con tabla `_migrations` como control de versiones. No usar Supabase CLI ni `rest/v1/rpc/exec_sql`.
- **Razón**: psql es estándar PostgreSQL, funciona en cualquier entorno (local, CI, Render), no depende de servicios propietarios, ejecuta dentro de transacciones reales, y es 100% auditable. Supabase CLI agrega complejidad innecesaria (Docker, config extra) para lo que necesitamos. El endpoint `rpc/exec_sql` no es un endpoint real de Supabase y no funciona.
