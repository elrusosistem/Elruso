-- 001_create_run_recorder.sql
-- Tablas del sistema de registro de ejecuciones (run recorder)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── run_logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  task_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'done', 'failed', 'blocked')),
  branch        TEXT,
  commit_hash   TEXT,
  pr_url        TEXT,
  summary       TEXT,
  artifact_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_logs_started_at ON run_logs (started_at DESC);

-- ─── run_steps ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES run_logs(id) ON DELETE CASCADE,
  step_name       TEXT NOT NULL,
  cmd             TEXT,
  exit_code       INTEGER,
  output_excerpt  TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps (run_id);

-- ─── file_changes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES run_logs(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  change_type TEXT NOT NULL
                CHECK (change_type IN ('added', 'modified', 'deleted', 'renamed'))
);

CREATE INDEX IF NOT EXISTS idx_file_changes_run_id ON file_changes (run_id);
