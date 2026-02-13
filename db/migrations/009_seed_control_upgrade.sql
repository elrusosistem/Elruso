-- 009_seed_control_upgrade.sql
-- Agrega seed_hash y git_sha a _seed_control para idempotencia por contenido

ALTER TABLE _seed_control ADD COLUMN IF NOT EXISTS seed_hash TEXT;
ALTER TABLE _seed_control ADD COLUMN IF NOT EXISTS git_sha TEXT;

COMMENT ON TABLE _seed_control IS 'Control de seeds idempotentes. Si seed_hash ya existe, no se reaplicar.';
