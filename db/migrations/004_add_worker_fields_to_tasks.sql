-- 004_add_worker_fields_to_tasks.sql
-- Agregar worker_id y started_at para atomic claims

ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ops_tasks_worker_id ON ops_tasks (worker_id);
