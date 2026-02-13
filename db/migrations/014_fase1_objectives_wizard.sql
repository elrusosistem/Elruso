-- Migration 014: FASE 1 — Objectives + Wizard State + Request extensions
-- Aplicar via Supabase SQL Editor

-- ─── 1. Tabla objectives ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS objectives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  profile     TEXT NOT NULL DEFAULT 'tiendanube',
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'paused', 'done')),
  priority    INT NOT NULL DEFAULT 1,
  owner_label TEXT DEFAULT NULL,
  last_reviewed_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_objectives_status ON objectives (status);
CREATE INDEX IF NOT EXISTS idx_objectives_profile ON objectives (profile);

-- ─── 2. Tabla wizard_state (single-row, CHECK id=1) ─────────────────
CREATE TABLE IF NOT EXISTS wizard_state (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  has_completed_wizard BOOLEAN NOT NULL DEFAULT FALSE,
  answers          JSONB NOT NULL DEFAULT '{}',
  current_profile  TEXT NOT NULL DEFAULT 'tiendanube',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single row
INSERT INTO wizard_state (id, has_completed_wizard, answers, current_profile)
VALUES (1, FALSE, '{}', 'tiendanube')
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Extender ops_requests ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ops_requests' AND column_name = 'required_for_planning'
  ) THEN
    ALTER TABLE ops_requests ADD COLUMN required_for_planning BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ops_requests' AND column_name = 'objective_id'
  ) THEN
    ALTER TABLE ops_requests ADD COLUMN objective_id TEXT DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ops_requests_planning
  ON ops_requests (required_for_planning) WHERE required_for_planning = TRUE;

-- ─── Track migration ─────────────────────────────────────────────────
INSERT INTO _migrations (filename, applied_at)
VALUES ('014_fase1_objectives_wizard.sql', NOW())
ON CONFLICT DO NOTHING;
