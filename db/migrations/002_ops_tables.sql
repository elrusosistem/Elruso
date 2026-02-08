-- 002_ops_tables.sql
-- Tablas ops: requests, tasks, directives (DB-first para panel y orquestador)

-- ─── ops_requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_requests (
  id              TEXT PRIMARY KEY,
  service         TEXT NOT NULL,
  type            TEXT NOT NULL,
  scopes          JSONB NOT NULL DEFAULT '[]',
  purpose         TEXT NOT NULL,
  where_to_set    TEXT NOT NULL DEFAULT '',
  validation_cmd  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'PROVIDED', 'REJECTED')),
  provided_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ops_tasks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_tasks (
  id              TEXT PRIMARY KEY,
  phase           INTEGER NOT NULL DEFAULT 0,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ready'
                    CHECK (status IN ('ready', 'running', 'done', 'failed', 'blocked')),
  branch          TEXT NOT NULL DEFAULT '',
  depends_on      JSONB NOT NULL DEFAULT '[]',
  blocked_by      JSONB NOT NULL DEFAULT '[]',
  directive_id    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_status ON ops_tasks (status);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_phase ON ops_tasks (phase);

-- ─── ops_directives ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_directives (
  id                  TEXT PRIMARY KEY,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source              TEXT NOT NULL DEFAULT 'gpt'
                        CHECK (source IN ('gpt', 'human', 'system')),
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPLIED', 'REJECTED')),
  title               TEXT NOT NULL,
  body                TEXT NOT NULL DEFAULT '',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  tasks_to_create     JSONB NOT NULL DEFAULT '[]',
  applied_at          TIMESTAMPTZ,
  applied_by          TEXT,
  rejection_reason    TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_directives_status ON ops_directives (status);
