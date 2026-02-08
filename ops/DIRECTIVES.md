# Directivas Estratégicas - Elruso

## Reglas Duras

1. **Todo por CLI**. No hay pasos manuales que no queden scriptados.
2. **Secrets nunca al repo**. Solo `.env.example` con placeholders.
3. **Antes de tocar código**: crear/actualizar `/ops/*` y `agent/CLAUDE.md`.
4. **Si falta una key/token/url/scope/decisión**: crear REQUEST en `/ops/REQUESTS.json` con status `WAITING` y frenar esa tarea. Continuar con la próxima si existe.
5. **No preguntar por chat**. Usar REQUESTS.
6. **Cada fase = branch `task/T-xxx`** + PR con Summary, Files, How to verify.
7. **Staging automático**. Deploy a prod solo cuando se indique explícitamente.
8. **Idempotencia en webhooks**: `event_id` + hash payload.
9. **Source of truth de stock**: nuestro sistema (no Tiendanube).
10. **No tocar precios**, solo stock.
11. **Si cambia arquitectura**: registrar decisión en `/ops/DECISIONS.md`.

## Prioridades

1. Funcionalidad correcta > velocidad de desarrollo
2. Idempotencia > performance
3. Simplicidad > features extras
4. CLI reproducible > documentación narrativa

## Convenciones

- Commits: tipo convencional (`feat:`, `fix:`, `chore:`, `docs:`)
- Branches: `task/T-xxx` para tareas, `main` como trunk
- Tests: mínimo health check + happy path por endpoint
- Logs: JSON estructurado en producción
