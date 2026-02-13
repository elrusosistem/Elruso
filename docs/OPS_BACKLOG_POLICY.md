# Politica de Backlog Operativo

## Clasificacion

### Produccion
Tasks que representan trabajo real del roadmap del producto. Se muestran al operador humano.

Prefijos validos:
- `T-0XX` a `T-0XX` — Tareas del roadmap original
- `T-GPT-*` — Generadas por GPT **si** representan trabajo accionable y no duplican existente

### Test / Debug
Tasks creadas para verificar infraestructura, probar features, o diagnosticar problemas. NO se muestran al operador en modo normal.

Prefijos/patrones de test:
- `T-TEST-*`, `T-SMOKE-*`, `T-CLAIM-*`, `T-AUDIT-*`
- `T-LOOP-*`, `T-STUCK-*`, `T-DUMMY-*`
- `SANDBOX-*`, `EXAMPLE-*`, `DEMO-*`
- Cualquier task cuyo title contenga "test" + "dummy/smoke/claim/sandbox"

## Reglas

1. **Tasks de test nunca quedan READY en produccion.**
   - Si son necesarias, se ejecutan y pasan a `done` inmediatamente.
   - Si fueron noise de GPT, se marcan `done` con nota en decisions_log.

2. **Tasks completadas se marcan `done`.**
   - Si el trabajo ya se hizo (ej: endpoint ya existe), marcar done.
   - No mantener tasks READY que ya se implementaron en otro contexto.

3. **Tasks stuck en `running` > 24h se revisan.**
   - Si el runner no las tiene claimed, mover a `ready` o `done` segun caso.
   - Registrar en decisions_log.

4. **GPT-generated tasks se validan antes de quedar READY.**
   - El apply de directivas las crea, pero el humano las revisa.
   - Si duplican trabajo existente, se marcan `done` en limpieza.

5. **No borrar tasks.** Solo cambiar status. Todo queda auditable.

## Mantenimiento

- Script: `scripts/maintenance_backlog_cleanup.sh`
- Ejecutar con `--dry-run` primero, `--apply` despues.
- Cada ejecucion registra un evento `backlog_cleanup` en decisions_log.
- El script es idempotente: correr 2 veces no cambia nada la 2da.

## Visibilidad en Panel

- **Modo Operador**: muestra solo tasks de produccion (no test, no deduped, no done).
- **Modo Tecnico**: muestra todo.
- Filtro client-side por patron de ID/title + status.
