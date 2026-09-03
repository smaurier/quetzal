interface TokenResponse {
  token: string;
  exp?: number;
}

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  /** Better-Auth JWT from the host (/api/auth/token), cached until 60 s before expiry. */
  getToken(): Promise<string | null>;
  /** fetch() with Authorization: Bearer <jwt> and first-party credentials. */
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
}

export function createApiClient(deps: { fetch?: FetchFn } = {}): ApiClient {
  const fetchFn: FetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
  let cachedToken: string | null = null;
  let expiresAt = 0;

  async function getToken(): Promise<string | null> {
    if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
    const res = await fetchFn('/api/auth/token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as TokenResponse;
    cachedToken = data.token;
    expiresAt = (data.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
    return cachedToken;
  }

  async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetchFn(path, { ...init, headers, credentials: 'include' });
  }

  return { getToken, apiFetch };
}

let defaultClient: ApiClient | null = null;

/** Shared client for module UIs (one token cache per browser tab). */
export function apiClient(): ApiClient {
  defaultClient ??= createApiClient();
  return defaultClient;
}
