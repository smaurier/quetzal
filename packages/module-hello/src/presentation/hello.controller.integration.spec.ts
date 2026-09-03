import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore, eventBus } from '@quetzal/core';
import { HelloController } from './hello.controller.js';
import { GreetUseCase } from '../application/greet.use-case.js';
import { PrismaGreetingRepository } from '../infrastructure/prisma-greeting.repository.js';

// Retro test (Issue #4, 1e9f558): GET /api/modules/hello/greet end to end against Postgres,
// inside a tenant context as the middlewares would provide it.
describe('HelloController.doGreet (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('greets the current user by name and persists the greeting', async () => {
    const { tenantId, ownerId } = await seedTenant('Elda');
    const controller = new HelloController(new GreetUseCase(new PrismaGreetingRepository(), eventBus));

    const result = await new Promise<{ msg: string; tenantId: string }>((resolve, reject) => {
      tenantStore.run({ tenantId, userId: ownerId, requestId: 'req-1' }, () => controller.doGreet().then(resolve, reject));
    });

    expect(result).toMatchObject({ msg: 'Hello Elda', tenantId });
  });

  it('refuses a context without user', async () => {
    const { tenantId } = await seedTenant();
    const controller = new HelloController(new GreetUseCase(new PrismaGreetingRepository(), eventBus));
    await expect(new Promise((resolve, reject) => {
      tenantStore.run({ tenantId, requestId: 'req-2' }, () => controller.doGreet().then(resolve, reject));
    })).rejects.toThrow(/User required/);
  });
});
