-- Migration 012: P2 Hygiene — indexes + deduped status
-- Most indexes already exist from migration 006; this adds missing ones
-- and extends run_logs status to include 'deduped' for soft-delete dedupe.

-- 1. Add 'deduped' to run_logs status constraint
ALTER TABLE run_logs DROP CONSTRAINT IF EXISTS run_logs_status_check;
ALTER TABLE run_logs ADD CONSTRAINT run_logs_status_check
  CHECK (status IN ('running', 'done', 'failed', 'blocked', 'deduped'));

-- 2. Missing index: runs by status + created_at (for metrics queries)
CREATE INDEX IF NOT EXISTS idx_run_logs_status_created_at
  ON run_logs (status, started_at DESC);

-- 3. Composite index for dedupe queries (task_id + commit_hash within time window)
CREATE INDEX IF NOT EXISTS idx_run_logs_dedupe
  ON run_logs (task_id, commit_hash, started_at DESC)
  WHERE status != 'deduped';
