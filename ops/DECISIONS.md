# Decisiones Arquitectonicas - El Ruso

## DEC-001: Monorepo con pnpm workspaces
- **Fecha**: 2026-02-08
- **Decision**: Usar pnpm workspaces en lugar de Turborepo/Nx
- **Razon**: Simplicidad. No necesitamos cache de builds distribuido. pnpm workspaces resuelve dependency linking y scripts.

## DEC-004: Worker con polling (no pub/sub)
- **Fecha**: 2026-02-08
- **Decision**: El worker pollea tareas en lugar de usar un message broker.
- **Razon**: Menos infraestructura. Supabase Postgres es suficiente como cola de tareas para nuestro volumen.

## DEC-005: Deploys staging automaticos, prod manuales
- **Fecha**: 2026-02-08
- **Decision**: CI deploya a staging en cada merge a main. Prod solo via script manual con confirmacion.
- **Razon**: Staging para validar rapido, prod requiere aprobacion explicita del operador.

## DEC-006: Node 22 LTS fijo
- **Fecha**: 2026-02-08
- **Decision**: Fijar Node 22 LTS en dev (.nvmrc, .tool-versions), CI (setup-node) y prod (engines en package.json, NODE_VERSION en Render).
- **Razon**: Node 22 es la version LTS activa con soporte hasta abril 2027.

## DEC-007: Migraciones con psql directo (fallback REST API)
- **Fecha**: 2026-02-08
- **Decision**: Usar `psql` contra `DATABASE_URL` para migraciones SQL. Si psql no conecta (pooler circuit breaker, IPv6), usar REST API de Supabase como fallback.
- **Razon**: psql es estandar PostgreSQL. El fallback REST evita bloqueos por problemas de infra de Supabase.

## DEC-008: REST API como acceso principal a Supabase
- **Fecha**: 2026-02-08
- **Decision**: Usar Supabase JS client (REST API) para todo el acceso a datos en vez de conexion directa PostgreSQL.
- **Razon**: El pooler de Supabase tiene circuit breaker abierto y la conexion directa requiere IPv6. REST API funciona siempre via HTTPS.

## DEC-009: tsbuildinfo fuera de git
- **Fecha**: 2026-02-08
- **Decision**: Agregar `*.tsbuildinfo` a .gitignore y eliminar los archivos trackeados.
- **Razon**: Si tsbuildinfo esta en git pero dist/ no, `tsc -b` en Render lee el tsbuildinfo stale, cree que el proyecto esta "up to date", y nunca genera dist/. Esto causaba `Cannot find module '@elruso/types'` en cada deploy.

## DEC-010: Vault local para secrets
- **Fecha**: 2026-02-08
- **Decision**: Los valores de REQUESTS se guardan en `ops/.secrets/requests_values.json` (gitignored). El panel tiene inputs para proveerlos. vault.ts los lee y genera .env.
- **Razon**: El humano necesita una forma de entregar credentials sin tocar archivos. El panel es la interfaz natural.
