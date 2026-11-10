/**
 * ⛔ LES QUATRE IMPORTS CI-DESSOUS SONT RELATIFS, ET CE N'EST PAS UN DÉTAIL DE
 * STYLE. Les écrire `@quetzal/core` ou `@quetzal/core/testing/index` compile,
 * passe le lint, et fait échouer les sept tests en
 * `TenantContextMissingError` sans jamais dire pourquoi.
 *
 * La raison, mesurée depuis ce dossier : un paquet qui déclare `exports` peut
 * s'importer par son propre nom (auto-résolution Node), et
 * `import.meta.resolve('@quetzal/core')` rend alors `…/packages/core/dist/index.js`.
 * Le `tenantStore` du test viendrait donc de `dist/tenant/tenant-context.js`
 * pendant que l'adaptateur sous test lit `src/tenant/tenant-context.ts` : DEUX
 * `AsyncLocalStorage` distincts, et un contexte posé par le test que le code
 * testé ne voit pas. Avec, en prime, un `dist/` qui peut être périmé.
 *
 * Le voisin `../tenant/tenant-scoped-client.integration.spec.ts` suit la même
 * règle, pour la même raison. Piège trouvé en remontant ce port (issue #28).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '../testing/index.js';
import { tenantStore } from '../tenant/tenant-context.js';
import { getTenantScopedPrisma } from '../tenant/scoped-prisma.js';
import { newId } from '@quetzal/db';
import { PrismaCardImageStore } from './prisma-image-store.js';

interface LotoDeckCardPrisma {
  loto_Deck: { create(args: unknown): Promise<unknown> };
  loto_Card: { createMany(args: unknown): Promise<unknown> };
}

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

/**
 * Issue #27, et le piège qu'elle ne nommait pas.
 *
 * `Loto_CardImage` est dédupliquée par empreinte (`@@unique([contentHash,
 * tenantId])`), donc une même image sert plusieurs cartes, dans plusieurs jeux.
 * « Les images du jeu » n'existe donc pas comme ensemble, et une suppression en
 * cascade détruirait l'image d'un voisin encore vivant.
 *
 * C'est pour ça que ces tests vivent ici et pas au niveau du cas d'usage :
 * seule une vraie base peut dire ce que le ramassage garde et ce qu'il détruit.
 * La doublure, elle, ne garde que le MOMENT de l'appel.
 */
describe('PrismaCardImageStore.deleteOrphans (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  const AUTRE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]);

  it('supprime une image que plus aucune carte ne référence', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const image = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));

    const supprimees = await inTenant(tenantId, ownerId, () => store.deleteOrphans());

    expect(supprimees).toBe(1);
    expect(await inTenant(tenantId, ownerId, () => store.findByHash(image.contentHash))).toBeNull();
  });

  /**
   * LE test de cette issue. Un jeu est supprimé, un autre garde la même image —
   * déduplication oblige, c'est la MÊME ligne. Elle doit survivre.
   */
  it('garde une image encore référencée par la carte d un autre jeu', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const partagee = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    const orpheline = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: AUTRE }));

    // Insertion directe plutot que PrismaDeckRepository : ce test vit desormais
    // dans le noyau, et le noyau ne depend pas du module loto (sens interdit,
    // §3). deleteOrphans lit encore loto_Card directement (dette nommee dans
    // core.prisma), donc ce test reproduit la meme table a la main.
    await inTenant(tenantId, ownerId, async () => {
      const prisma = getTenantScopedPrisma() as unknown as LotoDeckCardPrisma;
      const deckId = newId();
      await prisma.loto_Deck.create({
        data: { id: deckId, name: 'Jeu gardé', isTemplate: false, createdBy: ownerId },
      });
      await prisma.loto_Card.createMany({
        data: [{ id: newId(), deckId, rank: 1, label: 'El gallo', imageId: partagee.id }],
      });
    });

    const supprimees = await inTenant(tenantId, ownerId, () => store.deleteOrphans());

    expect(supprimees, 'seule l orpheline doit partir').toBe(1);
    expect(
      await inTenant(tenantId, ownerId, () => store.findByHash(partagee.contentHash)),
      'une image encore référencée ne doit JAMAIS être ramassée',
    ).not.toBeNull();
    expect(await inTenant(tenantId, ownerId, () => store.findByHash(orpheline.contentHash))).toBeNull();
  });

  it('ne touche pas aux images d un autre locataire', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const store = new PrismaCardImageStore();

    const sienne = await inTenant(voisin.tenantId, voisin.ownerId, () =>
      store.put({ mimeType: 'image/webp', bytes: PNG }),
    );

    await inTenant(chezNous.tenantId, chezNous.ownerId, () => store.deleteOrphans());

    expect(
      await inTenant(voisin.tenantId, voisin.ownerId, () => store.findByHash(sienne.contentHash)),
      'le ramassage d un locataire ne doit rien voir chez le voisin',
    ).not.toBeNull();
  });

  it('ne supprime rien quand il n y a rien à ramasser', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    expect(await inTenant(tenantId, ownerId, () => store.deleteOrphans())).toBe(0);
  });
});
