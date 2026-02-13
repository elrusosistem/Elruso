const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

/**
 * Wrapper de fetch que agrega Authorization header si VITE_ADMIN_TOKEN está seteado.
 * Drop-in replacement para fetch() — misma firma.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!ADMIN_TOKEN) return fetch(input, init);

  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
  }

  return fetch(input, { ...init, headers });
}
