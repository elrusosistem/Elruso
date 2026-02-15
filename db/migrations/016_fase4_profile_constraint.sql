-- Migration 016: FASE 4 — Profile constraint on projects
-- Aplicar via Supabase SQL Editor

-- ─── 1. Update existing 'generic' profiles to 'open' ──────────────────
UPDATE projects SET profile = 'open' WHERE profile = 'generic';

-- ─── 2. Change default from 'generic' to 'open' ───────────────────────
ALTER TABLE projects ALTER COLUMN profile SET DEFAULT 'open';

-- ─── 3. Add CHECK constraint ──────────────────────────────────────────
ALTER TABLE projects
  ADD CONSTRAINT chk_projects_profile
  CHECK (profile IN ('open', 'tiendanube', 'waba'));

-- ─── 4. Index on profile ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_profile ON projects (profile);

-- ─── Track migration ─────────────────────────────────────────────────
INSERT INTO _migrations (filename, applied_at)
VALUES ('016_fase4_profile_constraint.sql', NOW())
ON CONFLICT DO NOTHING;
