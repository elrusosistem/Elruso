-- Migration 013: P4 — directive schema version + task hash for idempotent apply
-- Applied: 2026-02-13

-- Add directive_schema_version column to ops_directives
ALTER TABLE ops_directives ADD COLUMN IF NOT EXISTS directive_schema_version TEXT DEFAULT 'v1';

-- Add task_hash column to ops_tasks for idempotent task creation
ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS task_hash TEXT;

-- Unique index on task_hash (where not null) to prevent duplicate tasks
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_tasks_task_hash
  ON ops_tasks (task_hash) WHERE task_hash IS NOT NULL;

-- Track migration
INSERT INTO _migrations (name, applied_at)
VALUES ('013_p4_directive_version_task_hash', NOW())
ON CONFLICT DO NOTHING;
