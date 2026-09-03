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

// Better-Auth generates plain-string ids for users and organizations (e.g. Ug58S8t0FXYHKDc0axHuEctYLValJ9lY),
// never UUIDs. CLAUDE.md §9: columns referencing Better-Auth entities must be plain String.
// In production the first real greet failed with P2023 "Error creating UUID" on userId.
describe('PrismaGreetingRepository with Better-Auth style ids (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('accepts a non-UUID Better-Auth user id', async () => {
    const { tenantId } = await seedTenant();
    const betterAuthUserId = 'Ug58S8t0FXYHKDc0axHuEctYLValJ9lY';
    const repo = new PrismaGreetingRepository();

    const result = await new Promise<{ userId: string }>((resolve, reject) => {
      tenantStore.run(
        { tenantId, userId: betterAuthUserId, requestId: 'test' },
        () => repo.save({ userId: betterAuthUserId, message: 'Hola' }).then(resolve, reject)
      );
    });

    expect(result.userId).toBe(betterAuthUserId);
  });

  it('accepts a non-UUID Better-Auth organization id as tenant', async () => {
    const root = new PrismaClient();
    const tenantId = 'OrgBetterAuthStyleId0123456789';
    await (root as unknown as { organization: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> } })
      .organization.create({ data: { id: tenantId, slug: 'ba-style', name: 'BA', createdAt: new Date() } });
    await root.$disconnect();
    const repo = new PrismaGreetingRepository();

    await expect(new Promise((resolve, reject) => {
      tenantStore.run(
        { tenantId, userId: 'Ug58S8t0FXYHKDc0axHuEctYLValJ9lY', requestId: 'test' },
        () => repo.save({ userId: 'Ug58S8t0FXYHKDc0axHuEctYLValJ9lY', message: 'Hola' }).then(resolve, reject)
      );
    })).resolves.toMatchObject({ message: 'Hola' });
  });
});
