import { describe, it, expect, vi } from 'vitest';
import { createSessionCreateHook } from './session-hooks';

// Better-Auth only sets session.activeOrganizationId when a client calls
// organization.setActive. Nobody does, so the JWT carried tenantId: null and every
// module route failed in production (Issue #14). At session creation we default
// to the user's first membership.
describe('createSessionCreateHook', () => {
  const session = { id: 's1', userId: 'u1', token: 't', expiresAt: new Date() };

  it('sets activeOrganizationId from the user first membership', async () => {
    const find = vi.fn().mockResolvedValue('org-1');
    const hook = createSessionCreateHook(find);
    const result = await hook(session);
    expect(find).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ data: { ...session, activeOrganizationId: 'org-1' } });
  });

  it('keeps an activeOrganizationId already present on the session', async () => {
    const find = vi.fn().mockResolvedValue('org-1');
    const hook = createSessionCreateHook(find);
    const result = await hook({ ...session, activeOrganizationId: 'org-9' });
    expect(find).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { ...session, activeOrganizationId: 'org-9' } });
  });

  it('leaves the session untouched when the user has no membership', async () => {
    const hook = createSessionCreateHook(vi.fn().mockResolvedValue(null));
    await expect(hook(session)).resolves.toBeUndefined();
  });
});
