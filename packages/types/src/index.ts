// ─── Tasks / Jobs ────────────────────────────────────────────────────
export type TaskStatus = "ready" | "running" | "done" | "failed" | "blocked";

export interface Task {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: TaskStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  retries: number;
  max_retries: number;
  run_after: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ─── Ops Requests ────────────────────────────────────────────────────
export type RequestStatus = "WAITING" | "PROVIDED" | "REJECTED";

export interface OpsRequest {
  id: string;
  service: string;
  type: string;
  scopes: string[];
  purpose: string;
  where_to_set: string;
  validation_cmd: string;
  status: RequestStatus;
  provided_at?: string;
}

// ─── Directives ─────────────────────────────────────────────────────
export type DirectiveStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED";

export interface Directive {
  id: string;
  source: "gpt" | "human";
  type: "create_task" | "update_task" | "decision" | "priority_change" | "instruction";
  payload: Record<string, unknown>;
  status: DirectiveStatus;
  applied_at?: string;
  applied_by?: string;
  rejection_reason?: string;
  created_at: string;
}

// ─── System State ───────────────────────────────────────────────────
export interface SystemState {
  key: string;
  value: boolean | string | number | Record<string, unknown>;
  updated_at: string;
}

// ─── Run Recorder ────────────────────────────────────────────────────
export type RunStatus = "running" | "done" | "failed" | "blocked";

export interface RunLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  task_id: string;
  status: RunStatus;
  branch: string | null;
  commit_hash: string | null;
  pr_url: string | null;
  summary: string | null;
  artifact_path: string | null;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_name: string;
  cmd: string | null;
  exit_code: number | null;
  output_excerpt: string | null;
  started_at: string;
  finished_at: string | null;
}

export type FileChangeType = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  id: string;
  run_id: string;
  path: string;
  change_type: FileChangeType;
}

export interface RunDetail extends RunLog {
  steps: RunStep[];
  file_changes: FileChange[];
}

// ─── Decisions Log ──────────────────────────────────────────────────
export type DecisionSource = "gpt" | "human" | "system";

export interface DecisionLog {
  id: string;
  created_at: string;
  source: DecisionSource;
  decision_key: string;
  decision_value: Record<string, unknown>;
  context: Record<string, unknown> | null;
  run_id: string | null;
}

// ─── API responses ───────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
  };
}
