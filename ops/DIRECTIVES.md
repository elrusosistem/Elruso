# Directivas Estrategicas - El Ruso

## Reglas Duras

1. **Todo por CLI**. No hay pasos manuales que no queden scriptados.
2. **Secrets nunca al repo**. Solo `.env.example` con placeholders.
3. **Antes de tocar codigo**: crear/actualizar `/ops/*` y `agent/CLAUDE.md`.
4. **Si falta una key/token/url/scope/decision**: crear REQUEST en `/ops/REQUESTS.json` con status `WAITING` y frenar esa tarea. Continuar con la proxima si existe.
5. **No preguntar por chat**. Usar REQUESTS.
6. **Cada fase = branch `task/T-xxx`** + PR con Summary, Files, How to verify.
7. **Staging automatico**. Deploy a prod solo cuando se indique explicitamente.
8. **GPT define, Claude ejecuta, Humano aprueba** — sin excepciones.
9. **Si cambia arquitectura**: registrar decision en `/ops/DECISIONS.md`.
10. **Runs como registro**: toda ejecucion significativa queda en run_logs.

## Prioridades

1. Funcionalidad correcta > velocidad de desarrollo
2. Simplicidad > features extras
3. CLI reproducible > documentacion narrativa
4. Pipeline funcionando > features nuevas

## Convenciones

- Commits: tipo convencional (`feat:`, `fix:`, `chore:`, `docs:`)
- Branches: `task/T-xxx` para tareas, `main` como trunk
- Tests: minimo health check + happy path por endpoint
- Logs: JSON estructurado en produccion
- Idioma: espanol en toda comunicacion y documentacion
