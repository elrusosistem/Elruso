-- 007_human_gate_approval.sql
-- Agrega sistema de aprobación humana para directivas + pausa global

-- 1) Modificar estados de ops_directives
-- Reemplazar constraint de status para incluir nuevos estados

-- Hacer todo en un solo bloque: drop constraint, update data, add nuevo constraint
DO $$
BEGIN
  -- 1. Drop constraint anterior (nombre generado por Supabase)
  ALTER TABLE ops_directives DROP CONSTRAINT IF EXISTS ops_directives_status_check;

  -- 2. Actualizar data existente: PENDING → PENDING_REVIEW
  UPDATE ops_directives SET status = 'PENDING_REVIEW' WHERE status = 'PENDING';

  -- 3. Agregar nuevo constraint con estados actualizados
  ALTER TABLE ops_directives
  ADD CONSTRAINT ops_directives_status_check
  CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED'));
END $$;

-- 2) Crear tabla de estado global del sistema
CREATE TABLE IF NOT EXISTS ops_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar estado inicial: sistema NO pausado
INSERT INTO ops_state (key, value)
VALUES ('system_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Índice para queries de estado
CREATE INDEX IF NOT EXISTS idx_ops_state_updated_at ON ops_state (updated_at DESC);
