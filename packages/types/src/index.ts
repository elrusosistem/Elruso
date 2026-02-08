// ─── Stock ───────────────────────────────────────────────────────────
export interface StockEntry {
  id: string;
  sku: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  reserved: number;
  available: number; // quantity - reserved
  warehouse: string;
  updated_at: string;
  created_at: string;
}

export type StockMovementType =
  | "reserve"
  | "release"
  | "adjust"
  | "reconcile"
  | "sync_in"
  | "sync_out";

export interface StockMovement {
  id: string;
  stock_entry_id: string;
  type: StockMovementType;
  quantity: number;
  reference_id: string | null;
  reference_type: string | null;
  reason: string | null;
  idempotency_key: string;
  created_at: string;
}

// ─── Tiendanube ──────────────────────────────────────────────────────
export interface TiendanubeStore {
  id: string;
  store_id: string;
  access_token: string;
  store_name: string;
  webhook_secret: string | null;
  last_sync_at: string | null;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  store_id: string;
  event_id: string;
  event_type: string;
  payload_hash: string;
  payload: Record<string, unknown>;
  status: "pending" | "processed" | "failed" | "duplicate";
  processed_at: string | null;
  created_at: string;
}

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
