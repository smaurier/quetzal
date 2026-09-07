import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaCardImageStore } from './prisma-card-image.store.js';

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe('PrismaCardImageStore (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('stocke une image et la relit par son empreinte', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const stored = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    expect(stored.contentHash).toHaveLength(64);

    const found = await inTenant(tenantId, ownerId, () => store.findByHash(stored.contentHash));
    expect(found?.mimeType).toBe('image/webp');
    expect(Array.from(found?.bytes ?? [])).toEqual(Array.from(PNG));
  });

  it('déduplique : le même contenu deux fois ne crée qu une ligne', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const first = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    const second = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));

    expect(second.id).toBe(first.id);
  });

  it('cloisonne les images entre locataires', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();
    const stored = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));

    const other = await seedTenant();
    const leaked = await inTenant(other.tenantId, other.ownerId, () => store.findByHash(stored.contentHash));
    expect(leaked).toBeNull();
  });
});
