import { describe, it, expect, vi } from 'vitest';
import { resolveSocketIdentity, WsUnauthenticatedError, canEmitWsEvent } from './handshake';

const user = { userId: 'u1', tenantId: 't1', role: 'owner', locale: 'fr' };
const guest = { tenantId: 't1', sessionId: 's1', guestId: 'g1', displayName: 'Ana', moduleSlug: 'hello', iat: 0, exp: 0 };

function verifiers(over: Partial<Parameters<typeof resolveSocketIdentity>[2]> = {}) {
  return {
    verifyUserToken: vi.fn(async () => user),
    verifyGuestToken: vi.fn(async () => guest),
    ...over,
  };
}

const openPolicy = { moduleSlug: 'hello', allowGuests: true };
const closedPolicy = { moduleSlug: 'hello', allowGuests: false };

describe('resolveSocketIdentity', () => {
  it('identifies a signed-in user from auth.token', async () => {
    const id = await resolveSocketIdentity({ token: 'jwt' }, openPolicy, verifiers());
    expect(id).toEqual({ role: 'owner', userId: 'u1', tenantId: 't1', locale: 'fr' });
  });

  it('identifies a guest from auth.guestToken when the module allows guests', async () => {
    const id = await resolveSocketIdentity({ guestToken: 'gt' }, openPolicy, verifiers());
    expect(id).toEqual({
      role: 'guest', guestId: 'g1', displayName: 'Ana',
      tenantId: 't1', sessionId: 's1', moduleSlug: 'hello',
    });
  });

  it('rejects a handshake without any token', async () => {
    await expect(resolveSocketIdentity({}, openPolicy, verifiers())).rejects.toBeInstanceOf(WsUnauthenticatedError);
  });

  it('rejects a guest token on a module that does not allow guests', async () => {
    await expect(resolveSocketIdentity({ guestToken: 'gt' }, closedPolicy, verifiers())).rejects.toBeInstanceOf(WsUnauthenticatedError);
  });

  it('rejects a guest token minted for another module', async () => {
    const v = verifiers({ verifyGuestToken: vi.fn(async () => ({ ...guest, moduleSlug: 'loto' })) });
    await expect(resolveSocketIdentity({ guestToken: 'gt' }, openPolicy, v)).rejects.toThrow(/module/i);
  });

  it('rejects an invalid user token instead of falling back to guest', async () => {
    const v = verifiers({ verifyUserToken: vi.fn(async () => { throw new Error('bad signature'); }) });
    await expect(resolveSocketIdentity({ token: 'jwt', guestToken: 'gt' }, openPolicy, v)).rejects.toBeInstanceOf(WsUnauthenticatedError);
    expect(v.verifyGuestToken).not.toHaveBeenCalled();
  });

  it('defaults a user without role to learner rather than granting more', async () => {
    const v = verifiers({ verifyUserToken: vi.fn(async () => ({ userId: 'u1', tenantId: 't1' })) });
    const id = await resolveSocketIdentity({ token: 'jwt' }, openPolicy, v);
    expect(id.role).toBe('learner');
  });
});

describe('canEmitWsEvent', () => {
  const permissions = { 'ws:ping': ['owner', 'guest'], 'http:GET /x': ['owner'] } as const;

  it('allows a role listed for the event', () => {
    expect(canEmitWsEvent(permissions, 'ping', 'guest')).toBe(true);
  });

  it('denies a role not listed for the event', () => {
    expect(canEmitWsEvent(permissions, 'ping', 'learner')).toBe(false);
  });

  it('denies an event absent from the matrix (fail closed)', () => {
    expect(canEmitWsEvent(permissions, 'draw', 'owner')).toBe(false);
  });

  it('never grants through an http entry', () => {
    expect(canEmitWsEvent(permissions, 'GET /x', 'owner')).toBe(false);
  });
});
