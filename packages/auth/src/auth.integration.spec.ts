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

  it('signs a user up and identifies the credential account by providerId and accountId', async () => {
    await auth.api.signUpEmail({ body: { email, password, name: 'Elda' } });
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { email } });
    const account = await rootPrisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.providerId).toBe('credential');
    expect(account.accountId).toBe(user.id);
    // `issuer` existait pour porter l'identite du compte en 1.7.0-1.7.2 ; depuis
    // 1.7.3 c'est (providerId, accountId) qui la porte et better-auth n'ecrit
    // plus cette colonne du tout. La garder NOT NULL faisait echouer l'insertion.
    expect(account.issuer).toBeNull();
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
