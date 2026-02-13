# Backlog Snapshot — Pre-Cleanup

Date: 2026-02-13
Source: GET /ops/tasks (prod API)

## Totals

| Status  | Count |
|---------|-------|
| ready   | 21    |
| running | 1     |
| done    | 11    |
| **Total** | **33** |

## By Phase

| Phase | Count |
|-------|-------|
| 0     | 7     |
| 1     | 4     |
| 2     | 6     |
| 3     | 3     |
| 4     | 3     |
| 5     | 3     |
| 6     | 3     |
| 7     | 2     |
| 99    | 2     |

## Noise Patterns Identified

### 1. STUCK running task
- **T-017** (running, phase 1) — "Ordenar el cerebro" — completed in previous sessions but never marked done in DB. Has been running for days.

### 2. GPT-generated test/duplicate tasks (phase 0-2, all READY)
- **T-GPT-1770951945000-memapi** — "Completar y testear endpoints POST /runs, /directives y /tasks (memoria real)" — These endpoints already exist and work.
- **T-GPT-1770996000000-memtest** — "Testear y validar endpoints POST /runs, /directives y /tasks (memoria real)" — Duplicate of above.
- **T-GPT-1770951852990-ek6p** — "Actualizar y limpiar docs y types en /ops" — Already done (T-017 covered this).
- **T-GPT-1770951852662-qvll** — "Test de POST /runs, /directives y /tasks desde panel y CLI" — Endpoints work, tests exist.
- **T-GPT-1770951853290-y93a** — "Test de sincronizacion con ops_sync_push.sh y ops_sync_pull.sh" — Scripts don't exist yet but this was GPT busywork.

### 3. Already-completed roadmap tasks still READY
- **T-020** — "POST /runs con steps y file_changes" — Already implemented (P2-P3).
- **T-021** — "POST /directives" — Already implemented (P4).
- **T-022** — "POST /tasks" — Already implemented (ops.ts POST endpoint).
- **T-023** — "Migrar scripts de psql a REST API" — Partially done, scripts use REST.
- **T-040** — "Panel: dashboard de estado" — Already implemented (P5-P6).
- **T-041** — "Panel: recibir y aplicar directivas" — Already implemented (P4-P6).
- **T-042** — "Panel: vista de diffs y file_changes" — Already implemented (RunDetail).
- **T-050** — "Runner 24/7: worker con loop autonomo" — Already implemented (P3).
- **T-051** — "Runner 24/7: reintentos con backoff" — Already implemented (P3).

### 4. Historical test tasks (already done, phase 99)
- **T-TEST-BADDEP** — done
- **T-TEST-P3** — done
- **T-LOOP-001** — done

## Action Plan

### Mark as DONE (already completed):
- T-017 (stuck running → done)
- T-020, T-021, T-022 (memory endpoints exist)
- T-040, T-041, T-042 (panel features exist)
- T-050, T-051 (runner features exist)

### Mark as DONE (GPT noise, superseded):
- T-GPT-1770951945000-memapi (superseded by actual implementation)
- T-GPT-1770996000000-memtest (duplicate)
- T-GPT-1770951852990-ek6p (superseded by T-017)
- T-GPT-1770951852662-qvll (superseded by actual tests)
- T-GPT-1770951853290-y93a (sync scripts not needed currently)

### Keep as READY (genuine future work):
- T-023 — Migrar scripts de psql a REST API (partial, still relevant)
- T-030, T-031, T-032 — E2E test tasks (genuine future work)
- T-052 — PRs automaticos (not implemented yet)
- T-060, T-061, T-062 — Hardening (future)

### Expected result after cleanup:
- ready: 7 (from 21)
- done: 25 (from 11)
- running: 0 (from 1)
