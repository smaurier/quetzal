import { describe, it, expect, vi } from 'vitest';
import { JwtAuthMiddleware } from './jwt-auth.middleware';

describe('JwtAuthMiddleware', () => {
  it('skips validation when no Authorization header', async () => {
    const mw = new JwtAuthMiddleware();
    const req = { headers: {} } as never;
    const next = vi.fn();
    await mw.use(req, {} as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as { authContext?: unknown }).authContext).toBeUndefined();
  });

  it('rejects malformed Bearer token', async () => {
    const mw = new JwtAuthMiddleware();
    const req = { headers: { authorization: 'Bearer invalid.token.here' } } as never;
    const next = vi.fn();
    await expect(mw.use(req, {} as never, next)).rejects.toThrow();
  });
});
