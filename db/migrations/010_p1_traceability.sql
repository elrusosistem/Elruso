-- 010_p1_traceability.sql
-- P1: Trazabilidad fuerte — directive_id en decisions_log + diffstat en file_changes

-- ─── decisions_log: agregar directive_id ──────────────────────────────
ALTER TABLE decisions_log ADD COLUMN IF NOT EXISTS directive_id UUID;
CREATE INDEX IF NOT EXISTS idx_decisions_log_directive_id ON decisions_log (directive_id);

-- Agregar source='runner' como opcion valida
ALTER TABLE decisions_log DROP CONSTRAINT IF EXISTS decisions_log_source_check;
ALTER TABLE decisions_log ADD CONSTRAINT decisions_log_source_check
  CHECK (source IN ('gpt', 'human', 'system', 'runner'));

-- ─── file_changes: agregar diffstat ──────────────────────────────────
ALTER TABLE file_changes ADD COLUMN IF NOT EXISTS diffstat TEXT;
