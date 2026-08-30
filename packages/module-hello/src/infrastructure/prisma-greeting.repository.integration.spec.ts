import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaGreetingRepository } from './prisma-greeting.repository.js';

interface HelloRow {
  id: string;
  tenantId: string;
  userId: string;
  message: string;
}

describe('PrismaGreetingRepository (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('persists a greeting scoped to current tenant', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaGreetingRepository();

    const result = await new Promise<{ id: string; userId: string; message: string }>((resolve) => {
      tenantStore.run(
        { tenantId, userId: ownerId, requestId: 'test' },
        async () => resolve(await repo.save({ userId: ownerId, message: 'Hello test' }))
      );
    });

    expect(result.message).toBe('Hello test');

    const root = new PrismaClient();
    const rows = await (root as unknown as { hello_Greeting: { findMany: (args: { where: { tenantId: string } }) => Promise<HelloRow[]> } }).hello_Greeting.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(1);
    await root.$disconnect();
  });
});
