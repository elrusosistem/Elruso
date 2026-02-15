-- Migration 015: FASE 3 — Multi-tenant (project_id)
-- Aplicar via Supabase SQL Editor

-- ─── 1. Tabla projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  profile    TEXT NOT NULL DEFAULT 'generic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- Proyecto default para backfill
INSERT INTO projects (id, name, profile)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default', 'tiendanube')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Agregar project_id a tablas (simple ADD COLUMN) ────────────────

ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE ops_directives
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE run_logs
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE decisions_log
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE runner_heartbeats
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- ─── 3. ops_requests: cambiar PK a (id, project_id) ───────────────────

ALTER TABLE ops_requests
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE ops_requests DROP CONSTRAINT IF EXISTS ops_requests_pkey;
ALTER TABLE ops_requests ADD PRIMARY KEY (id, project_id);

-- ─── 4. wizard_state: cambiar de id=1 single-row a project_id PK ──────

-- Quitar constraint CHECK(id=1)
DO $$ BEGIN
  ALTER TABLE wizard_state DROP CONSTRAINT IF EXISTS wizard_state_id_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE wizard_state DROP CONSTRAINT IF EXISTS wizard_state_pkey;

ALTER TABLE wizard_state
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

ALTER TABLE wizard_state ADD PRIMARY KEY (project_id);

ALTER TABLE wizard_state DROP COLUMN IF EXISTS id;

-- ─── 5. Re-scope unique indexes ───────────────────────────────────────

-- task_hash: de global a (project_id, task_hash)
DROP INDEX IF EXISTS idx_ops_tasks_task_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_tasks_project_task_hash
  ON ops_tasks (project_id, task_hash) WHERE task_hash IS NOT NULL;

-- payload_hash: de global a (project_id, payload_hash)
DROP INDEX IF EXISTS idx_ops_directives_payload_hash;
CREATE INDEX IF NOT EXISTS idx_ops_directives_project_payload_hash
  ON ops_directives (project_id, payload_hash) WHERE payload_hash IS NOT NULL;

-- ─── 6. Indexes compuestos nuevos ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ops_tasks_project_status
  ON ops_tasks (project_id, status, phase, next_run_at);

CREATE INDEX IF NOT EXISTS idx_ops_directives_project_status
  ON ops_directives (project_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_ops_requests_project_status
  ON ops_requests (project_id, status);

CREATE INDEX IF NOT EXISTS idx_decisions_log_project_created
  ON decisions_log (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_run_logs_project_created
  ON run_logs (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_runner_heartbeats_project_created
  ON runner_heartbeats (project_id, created_at);

-- ─── Track migration ─────────────────────────────────────────────────
INSERT INTO _migrations (filename, applied_at)
VALUES ('015_fase3_multitenant.sql', NOW())
ON CONFLICT DO NOTHING;
