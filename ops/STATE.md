# STATE.md — Estado Vivo del Proyecto

> Actualizar este archivo al terminar cada cambio significativo.
> Última actualización: 2026-02-08

---

## HEAD

```
a0032ee feat: bridge GPT↔Claude + inbox humano + panel requests/directives/tasks
```

**Branch**: `main`

---

## Pasos Completados (DONE)

| Paso | Descripción | Commits |
|---|---|---|
| 0 | Bootstrap monorepo + ops + scripts + CI | `4fc4be4` |
| 0 | Fix Node 22 LTS + migraciones psql | `7256c82` |
| 0 | Run recorder + panel de runs + security fix | `2e9c1d7` |
| 0 | Bridge GPT↔Claude + inbox + panel completo | `a0032ee` |

---

## Paso Actual: EN ESPERA

**Fase 1** (Stock core) está lista para arrancar pero **bloqueada por credentials**.

---

## Requests WAITING

| ID | Servicio | Qué falta | Bloquea |
|---|---|---|---|
| REQ-001 | Supabase | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | T-001 a T-012 (todo) |
| REQ-002 | Render | RENDER_API_TOKEN | T-011, T-012 |
| REQ-003 | Vercel | VERCEL_TOKEN | T-009, T-010, T-012 |
| REQ-004 | GitHub | REPO_URL (remote origin) | T-011 |
| REQ-005 | Supabase | DATABASE_URL (connection string psql) | Migraciones reales |

---

## Próximo Objetivo Inmediato

1. **Humano provee REQ-001 + REQ-005** → desbloquea Fase 1
2. **T-001**: Ejecutar migraciones DB (stock_entries, stock_movements)
3. **T-002**: Implementar stock engine (reservar, liberar, ajustar, reconciliar)

---

## Último Run Report

No hay runs registrados aún (no hay DB credentials para persistir, ni se han generado reports locales).

---

## Tasks por Estado

- **done**: T-000, T-013, T-014, T-015
- **ready**: T-001 a T-012 (bloqueadas por REQ-001+)
- **running**: ninguna
- **failed**: ninguna
