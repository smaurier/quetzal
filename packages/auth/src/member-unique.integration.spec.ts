import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { rootPrisma, newId } from '@quetzal/db';

// Retro test (Issue #4, d972c6f): merge-schemas injects @@unique([userId, organizationId])
// on Member so the seed can upsert on the composite key.
describe('Member composite unique (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('upsert on userId_organizationId is idempotent', async () => {
    const { tenantId, ownerId } = await seedTenant();
    for (let i = 0; i < 2; i++) {
      await rootPrisma.member.upsert({
        where: { userId_organizationId: { userId: ownerId, organizationId: tenantId } },
        create: { id: newId(), userId: ownerId, organizationId: tenantId, role: 'owner', createdAt: new Date() },
        update: { role: 'owner' },
      });
    }
    expect(await rootPrisma.member.count({ where: { userId: ownerId, organizationId: tenantId } })).toBe(1);
  });

  it('rejects a second membership of the same user in the same organization', async () => {
    const { tenantId, ownerId } = await seedTenant();
    await expect(
      rootPrisma.member.create({ data: { id: newId(), userId: ownerId, organizationId: tenantId, role: 'learner', createdAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
