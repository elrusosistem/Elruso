-- 003_decisions_log_and_seed_control.sql
-- Tabla de decisiones arquitectonicas + control de seeds idempotentes

-- ─── decisions_log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT NOT NULL DEFAULT 'system'
                    CHECK (source IN ('gpt', 'human', 'system')),
  decision_key    TEXT NOT NULL,
  decision_value  JSONB NOT NULL DEFAULT '{}',
  context         JSONB,
  run_id          UUID REFERENCES run_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_log_created_at ON decisions_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_log_run_id ON decisions_log (run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_log_key ON decisions_log (decision_key);

-- ─── _seed_control ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _seed_control (
  id          SERIAL PRIMARY KEY,
  seed_name   TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
