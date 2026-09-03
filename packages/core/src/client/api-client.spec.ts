import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient } from './api-client';

// Module UIs call the API with a Better-Auth JWT (Authorization: Bearer). The token comes
// from the host's /api/auth/token (same-origin cookie) and is cached until shortly before exp.
describe('createApiClient', () => {
  const now = 1_700_000_000_000;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });

  function fetchStub(token = 'jwt-1', exp = Math.floor(now / 1000) + 3600) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/auth/token')) return new Response(JSON.stringify({ token, exp }), { status: 200 });
      return new Response('{}', { status: 200 });
    });
  }

  it('adds the Bearer header from /api/auth/token', async () => {
    const fetchFn = fetchStub();
    const client = createApiClient({ fetch: fetchFn });
    await client.apiFetch('/api/modules/hello/greet');
    const [, init] = fetchFn.mock.calls[1]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-1');
    expect(init?.credentials).toBe('include');
  });

  it('caches the token across calls until 60s before expiry', async () => {
    const fetchFn = fetchStub('jwt-1', Math.floor(now / 1000) + 120);
    const client = createApiClient({ fetch: fetchFn });
    await client.apiFetch('/a');
    await client.apiFetch('/b');
    expect(fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/token'))).toHaveLength(1);
    vi.setSystemTime(now + 61_000);
    await client.apiFetch('/c');
    expect(fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/token'))).toHaveLength(2);
  });

  it('sends no Authorization header when the token endpoint fails', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
    const client = createApiClient({ fetch: fetchFn });
    await client.apiFetch('/a');
    const [, init] = fetchFn.mock.calls[1]!;
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});
