-- Migration 017: Fix task_hash dedup scope — intra-directive only
-- Root cause: migration 013 created a GLOBAL unique index on task_hash,
-- blocking tasks from different directives if GPT generated similar content.
-- Fix: replace with UNIQUE(directive_id, task_hash) scoped per directive.
-- Applied: 2026-02-15

-- Drop the global unique index (cause of cross-directive blocking)
DROP INDEX IF EXISTS idx_ops_tasks_task_hash;

-- Create scoped unique index: dedup only within the same directive
-- WHERE task_hash IS NOT NULL AND directive_id IS NOT NULL
-- Tasks without a directive (manual/seed) are not subject to dedup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_tasks_directive_task_hash
  ON ops_tasks (directive_id, task_hash)
  WHERE task_hash IS NOT NULL AND directive_id IS NOT NULL;

-- Track migration
INSERT INTO _migrations (filename, applied_at)
VALUES ('017_fix_task_hash_dedup_scope.sql', NOW())
ON CONFLICT DO NOTHING;
