import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { rootPrisma, newId } from '@quetzal/db';

// Retro test : 20261102150000 a retire account_issuer_accountId_uidx avec la
// colonne `issuer` et laisse `account` sans aucune unicite. Better-Auth resout
// un compte par (providerId, accountId), c'est ce couple qui porte l'invariant.
describe('Account composite unique (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  const account = (userId: string, providerId: string, accountId: string) => ({
    id: newId(), userId, providerId, accountId, createdAt: new Date(), updatedAt: new Date(),
  });

  it('rejects a second account for the same pair at the same provider', async () => {
    const { ownerId } = await seedTenant();
    await rootPrisma.account.create({ data: account(ownerId, 'credential', ownerId) });

    await expect(
      rootPrisma.account.create({ data: account(ownerId, 'credential', ownerId) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('accepts the same accountId at two different providers', async () => {
    const { ownerId } = await seedTenant();
    await rootPrisma.account.create({ data: account(ownerId, 'credential', ownerId) });
    await rootPrisma.account.create({ data: account(ownerId, 'google', ownerId) });

    expect(await rootPrisma.account.count({ where: { userId: ownerId } })).toBe(2);
  });
});
