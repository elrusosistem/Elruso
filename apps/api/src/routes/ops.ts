import type { FastifyInstance } from "fastify";
import type { ApiResponse, OpsRequest } from "@elruso/types";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Helpers: leer/escribir JSON de ops ──────────────────────────────
const OPS_DIR = resolve(import.meta.dirname, "../../../../ops");

function readJson<T>(filename: string): T {
  const filepath = resolve(OPS_DIR, filename);
  const content = readFileSync(filepath, "utf-8");
  return JSON.parse(content) as T;
}

function writeJson(filename: string, data: unknown): void {
  const filepath = resolve(OPS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ─── Types locales para directivas y tasks ───────────────────────────
interface Directive {
  id: string;
  created_at: string;
  source: string;
  status: "PENDING" | "APPLIED" | "REJECTED";
  title: string;
  body: string;
  acceptance_criteria: string[];
  tasks_to_create: unknown[];
  applied_at: string | null;
  applied_by: string | null;
  rejection_reason: string | null;
}

interface TaskEntry {
  id: string;
  phase: number;
  title: string;
  status: string;
  branch: string;
  depends_on: string[];
  blocked_by: string[];
  directive_id?: string;
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  // TODO: agregar auth middleware en Fase 6

  // ─── REQUESTS ────────────────────────────────────────────────────

  app.get("/ops/requests", async (): Promise<ApiResponse<OpsRequest[]>> => {
    const data = readJson<OpsRequest[]>("REQUESTS.json");
    return { ok: true, data };
  });

  app.patch<{ Params: { id: string }; Body: { status: string; provided_at?: string } }>(
    "/ops/requests/:id",
    async (request): Promise<ApiResponse<OpsRequest>> => {
      const { id } = request.params;
      const { status, provided_at } = request.body as { status: string; provided_at?: string };

      const validStatuses = ["WAITING", "PROVIDED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const data = readJson<OpsRequest[]>("REQUESTS.json");
      const idx = data.findIndex((r) => r.id === id);
      if (idx === -1) {
        return { ok: false, error: `Request ${id} no encontrado` };
      }

      data[idx].status = status as OpsRequest["status"];
      if (provided_at) data[idx].provided_at = provided_at;
      if (status === "PROVIDED" && !data[idx].provided_at) {
        data[idx].provided_at = new Date().toISOString();
      }

      writeJson("REQUESTS.json", data);
      return { ok: true, data: data[idx] };
    }
  );

  // ─── DIRECTIVES ──────────────────────────────────────────────────

  app.get("/ops/directives", async (): Promise<ApiResponse<Directive[]>> => {
    const data = readJson<Directive[]>("DIRECTIVES_INBOX.json");
    return { ok: true, data };
  });

  app.get<{ Params: { id: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const { id } = request.params;
      const data = readJson<Directive[]>("DIRECTIVES_INBOX.json");
      const directive = data.find((d) => d.id === id);
      if (!directive) {
        return { ok: false, error: `Directiva ${id} no encontrada` };
      }
      return { ok: true, data: directive };
    }
  );

  app.patch<{ Params: { id: string }; Body: { status: string; rejection_reason?: string } }>(
    "/ops/directives/:id",
    async (request): Promise<ApiResponse<Directive>> => {
      const { id } = request.params;
      const { status, rejection_reason } = request.body as {
        status: string;
        rejection_reason?: string;
      };

      const validStatuses = ["PENDING", "APPLIED", "REJECTED"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const data = readJson<Directive[]>("DIRECTIVES_INBOX.json");
      const idx = data.findIndex((d) => d.id === id);
      if (idx === -1) {
        return { ok: false, error: `Directiva ${id} no encontrada` };
      }

      data[idx].status = status as Directive["status"];
      if (status === "APPLIED") {
        data[idx].applied_at = new Date().toISOString();
        data[idx].applied_by = "human";
      }
      if (status === "REJECTED" && rejection_reason) {
        data[idx].rejection_reason = rejection_reason;
      }

      writeJson("DIRECTIVES_INBOX.json", data);
      return { ok: true, data: data[idx] };
    }
  );

  // ─── TASKS ───────────────────────────────────────────────────────

  app.get("/ops/tasks", async (request): Promise<ApiResponse<TaskEntry[]>> => {
    const data = readJson<TaskEntry[]>("TASKS.json");
    const url = new URL(request.url, "http://localhost");
    const statusFilter = url.searchParams.get("status");
    const phaseFilter = url.searchParams.get("phase");

    let filtered = data;
    if (statusFilter) {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }
    if (phaseFilter) {
      filtered = filtered.filter((t) => t.phase === Number(phaseFilter));
    }

    return { ok: true, data: filtered };
  });

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    "/ops/tasks/:id",
    async (request): Promise<ApiResponse<TaskEntry>> => {
      const { id } = request.params;
      const { status } = request.body as { status: string };

      const validStatuses = ["ready", "running", "done", "failed", "blocked"];
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `Status inválido. Opciones: ${validStatuses.join(", ")}` };
      }

      const data = readJson<TaskEntry[]>("TASKS.json");
      const idx = data.findIndex((t) => t.id === id);
      if (idx === -1) {
        return { ok: false, error: `Task ${id} no encontrada` };
      }

      data[idx].status = status;
      writeJson("TASKS.json", data);
      return { ok: true, data: data[idx] };
    }
  );
}
