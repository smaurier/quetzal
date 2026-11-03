import { describe, it, expect, beforeAll } from 'vitest';
import { createRootPrismaClient, resetRootPrismaClient } from './clients';

// Le client racine est memoise au premier acces et se lie a DATABASE_URL a cet
// instant. Les suites d integration changent DATABASE_URL apres coup (conteneur
// de test) : sans invalidation, l application continue d ecrire dans l ancienne
// base pendant que le nettoyage tronque la nouvelle.
describe('createRootPrismaClient', () => {
  beforeAll(() => {
    process.env['DATABASE_URL'] ??= 'postgresql://unused:unused@127.0.0.1:1/unused';
  });

  it('hands out the same client twice', () => {
    expect(createRootPrismaClient()).toBe(createRootPrismaClient());
  });

  it('hands out a new client after a reset', async () => {
    const first = createRootPrismaClient();
    await resetRootPrismaClient();
    expect(createRootPrismaClient()).not.toBe(first);
  });
});
