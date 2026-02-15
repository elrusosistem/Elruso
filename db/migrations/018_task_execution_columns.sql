-- Migration 018: Agregar columnas de ejecucion a ops_tasks
-- task_type: tipo de task (generic, echo, shell, etc.)
-- steps: array JSON de steps ejecutables [{name, cmd}, ...]
-- params: parametros para handlers builtin del executor
-- Defaults seguros → backward compatible con tasks existentes

ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]';
ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '{}';

-- Registrar migracion
INSERT INTO _migrations (name, applied_at)
VALUES ('018_task_execution_columns', NOW())
ON CONFLICT (name) DO NOTHING;
