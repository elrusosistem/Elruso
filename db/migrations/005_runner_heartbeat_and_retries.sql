-- 005_runner_heartbeat_and_retries.sql
-- Agregar heartbeat del runner y sistema de reintentos para tasks

-- Tabla para heartbeats del runner (permite monitorear online/offline)
CREATE TABLE IF NOT EXISTS runner_heartbeats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id       TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta            JSONB
);

CREATE INDEX IF NOT EXISTS idx_runner_heartbeats_runner_id ON runner_heartbeats (runner_id);
CREATE INDEX IF NOT EXISTS idx_runner_heartbeats_last_seen ON runner_heartbeats (last_seen_at DESC);

-- Agregar columnas de reintentos y tracking a ops_tasks
ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS attempts       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts   INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error     TEXT,
  ADD COLUMN IF NOT EXISTS claimed_by     TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at    TIMESTAMPTZ;

-- Índices para queries de elegibilidad y monitoring
CREATE INDEX IF NOT EXISTS idx_ops_tasks_status_priority_next_run ON ops_tasks (status, phase, next_run_at);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_claimed_by ON ops_tasks (claimed_by, claimed_at);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_started_at ON ops_tasks (started_at);
