import { describe, it, expect } from 'vitest';
import type { SocketIdentity } from '@quetzal/core';
import { buildSocketTenantContext } from './socket-tenant-context';

const guest: SocketIdentity = {
  role: 'guest',
  guestId: 'g1',
  displayName: 'Ana',
  tenantId: 't1',
  sessionId: 's1',
  moduleSlug: 'hello',
};

const user: SocketIdentity = { role: 'owner', userId: 'u1', tenantId: 't1', locale: 'fr' };

// The platform opens this context at the handshake (QuetzalIoAdapter), never in a module.
// A user with no org (tenantId: null) gets no context, mirroring TenantMiddleware on the
// HTTP side: the connection is still accepted, but a tenant-scoped repository fails
// closed with TenantContextMissingError instead of guessing a tenant.
describe('buildSocketTenantContext', () => {
  it('gives a guest a tenant id and the guest role, without a userId', () => {
    const ctx = buildSocketTenantContext(guest, 'req-1');
    expect(ctx).toEqual({ tenantId: 't1', role: 'guest', requestId: 'req-1' });
    expect(ctx && 'userId' in ctx).toBe(false);
  });

  it('gives an authenticated user their tenant, role and locale', () => {
    const ctx = buildSocketTenantContext(user, 'req-2');
    expect(ctx).toEqual({ tenantId: 't1', userId: 'u1', role: 'owner', locale: 'fr', requestId: 'req-2' });
  });

  it('opens no context for an authenticated user with no resolvable tenant', () => {
    const ctx = buildSocketTenantContext({ ...user, tenantId: null }, 'req-3');
    expect(ctx).toBeUndefined();
  });

  it('omits locale rather than setting it to undefined when the claim is not a known locale', () => {
    const ctx = buildSocketTenantContext({ ...user, locale: 'de' }, 'req-4');
    expect(ctx && 'locale' in ctx).toBe(false);
  });

  it('carries the requestId through unchanged, one per connection', () => {
    const ctx = buildSocketTenantContext(user, 'same-request-id');
    expect(ctx?.requestId).toBe('same-request-id');
  });
});
