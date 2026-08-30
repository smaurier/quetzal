import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { rootPrisma, createTenantScopedClient, TenantScopeViolationError, newId } from './index.js';

describe('TenantScopedPrismaClient (integration)', () => {
  beforeAll(async () => {
    await ensureTestPostgres();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('reads only rows of the current tenant', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    await rootPrisma.auditLog.createMany({
      data: [
        { id: newId(), tenantId: tA, action: 'test.event', createdAt: new Date() },
        { id: newId(), tenantId: tB, action: 'test.event', createdAt: new Date() },
      ],
    });

    const scopedA = createTenantScopedClient(rootPrisma, tA);
    const rows = await scopedA.auditLog.findMany({ where: { action: 'test.event' } });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tA);
  });

  it('throws when creating with a foreign tenantId', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    const scopedA = createTenantScopedClient(rootPrisma, tA);
    await expect(
      scopedA.auditLog.create({
        data: { id: newId(), tenantId: tB, action: 'evil.attempt' } as never,
      })
    ).rejects.toThrow(TenantScopeViolationError);
  });

  it('throws when where.tenantId explicitly mismatches ctx', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    const scopedA = createTenantScopedClient(rootPrisma, tA);
    await expect(
      scopedA.auditLog.findMany({ where: { tenantId: tB } as never })
    ).rejects.toThrow(TenantScopeViolationError);
  });
});
