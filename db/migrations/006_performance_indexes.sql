-- 006_performance_indexes.sql
-- Índices adicionales para mejorar performance de queries comunes

-- Índice para queries de runs por task_id
CREATE INDEX IF NOT EXISTS idx_run_logs_task_id ON run_logs (task_id);

-- Índice compuesto para queries de runs por task ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_run_logs_task_id_started_at ON run_logs (task_id, started_at DESC);

-- Índice para queries de tasks por status + created_at (útil para backlog age)
CREATE INDEX IF NOT EXISTS idx_ops_tasks_status_created_at ON ops_tasks (status, created_at ASC);

-- Índice para directives ordenadas por created_at
CREATE INDEX IF NOT EXISTS idx_ops_directives_created_at ON ops_directives (created_at DESC);
