-- 008_directive_payload.sql
-- Agrega payload_json (contrato validado) y payload_hash (idempotencia) a ops_directives

ALTER TABLE ops_directives ADD COLUMN IF NOT EXISTS payload_json JSONB;
ALTER TABLE ops_directives ADD COLUMN IF NOT EXISTS payload_hash TEXT;

-- Índice para buscar por hash (idempotencia de apply)
CREATE INDEX IF NOT EXISTS idx_ops_directives_payload_hash ON ops_directives (payload_hash)
  WHERE payload_hash IS NOT NULL;
