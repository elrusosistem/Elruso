const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

/**
 * Wrapper de fetch que agrega Authorization + X-Project-Id headers.
 * Drop-in replacement para fetch() — misma firma.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (ADMIN_TOKEN && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
  }

  // Inject X-Project-Id from localStorage
  if (!headers.has("X-Project-Id")) {
    const stored = localStorage.getItem("elruso_selected_project");
    if (stored) {
      try {
        const project = JSON.parse(stored);
        if (project?.id) headers.set("X-Project-Id", project.id);
      } catch { /* ignore */ }
    }
  }

  return fetch(input, { ...init, headers });
}
