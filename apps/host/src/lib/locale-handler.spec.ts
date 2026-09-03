import { describe, it, expect, vi } from 'vitest';
import { createLocalePatchHandler } from './locale-handler';

// Retro test (Issue #4, a0f68e1): PATCH /api/user/locale — 401 without session,
// 400 on an unknown locale, 200 + NEXT_LOCALE cookie on the happy path.
function request(body: unknown) {
  return new Request('http://host.test/api/user/locale', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('createLocalePatchHandler', () => {
  it('answers 401 when there is no session', async () => {
    const handler = createLocalePatchHandler({ getSession: async () => null, updateLocale: vi.fn() });
    const res = await handler(request({ locale: 'en' }));
    expect(res.status).toBe(401);
  });

  it('answers 400 on an unsupported locale and does not write', async () => {
    const updateLocale = vi.fn();
    const handler = createLocalePatchHandler({ getSession: async () => ({ user: { id: 'u1' } }), updateLocale });
    const res = await handler(request({ locale: 'de' }));
    expect(res.status).toBe(400);
    expect(updateLocale).not.toHaveBeenCalled();
  });

  it('updates the user locale and sets the NEXT_LOCALE cookie', async () => {
    const updateLocale = vi.fn(async () => undefined);
    const handler = createLocalePatchHandler({ getSession: async () => ({ user: { id: 'u1' } }), updateLocale });
    const res = await handler(request({ locale: 'es' }));
    expect(res.status).toBe(200);
    expect(updateLocale).toHaveBeenCalledWith('u1', 'es');
    expect(res.headers.get('set-cookie')).toMatch(/NEXT_LOCALE=es/);
  });
});
