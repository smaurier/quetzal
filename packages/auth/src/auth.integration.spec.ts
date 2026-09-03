import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase } from '@quetzal/core/testing/index';
import { rootPrisma, newId } from '@quetzal/db';
import { auth } from './index.js';

// Retro test (Issue #4, c5520bc): Better-Auth is wired to Prisma and the organization +
// jwt plugins; the session hook picks the first membership as active organization.
describe('Better-Auth scaffold (integration)', () => {
  const email = 'owner@quetzal.test';
  const password = 'A-long-enough-password-123';

  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('getSession answers null without a cookie', async () => {
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it('signs a user up and creates a credential account with the 1.7 issuer', async () => {
    await auth.api.signUpEmail({ body: { email, password, name: 'Elda' } });
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { email } });
    const account = await rootPrisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe('credential');
    expect(account.issuer).toBe('local:credential');
  });

  it('a new session gets the user first organization as active organization', async () => {
    await auth.api.signUpEmail({ body: { email, password, name: 'Elda' } });
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { email } });
    const orgId = newId();
    await rootPrisma.organization.create({ data: { id: orgId, slug: 'default', name: 'Elda', createdAt: new Date() } });
    await rootPrisma.member.create({ data: { id: newId(), userId: user.id, organizationId: orgId, role: 'owner', createdAt: new Date() } });

    await auth.api.signInEmail({ body: { email, password } });

    const session = await rootPrisma.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    expect(session.activeOrganizationId).toBe(orgId);
  });
});
