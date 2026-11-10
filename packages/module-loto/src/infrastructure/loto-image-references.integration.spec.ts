import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { LotoImageReferences } from './loto-image-references.js';
import { PrismaDeckRepository } from './prisma-deck.repository.js';

/**
 * ⛔ CE QUE CE FOURNISSEUR REPOND DECIDE SI DES IMAGES SURVIVENT.
 *
 * `deleteOrphans` supprime tout ce qui n est PAS dans la liste rendue ici. Un
 * fournisseur qui rendrait une liste vide ou incomplete ne provoquerait aucune
 * erreur : il detruirait des images, en silence, et rendrait un nombre de
 * suppressions flatteur. C est pour ca que cette lecture se prouve contre un
 * vrai Postgres et non contre une doublure.
 */

/** Execute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

describe('LotoImageReferences (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('rend l id d une image qu une carte reference encore', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    await inTenant(tenantId, ownerId, () =>
      decks.create({
        name: 'Jeu', isTemplate: false, createdBy: ownerId,
        cards: [{ rank: 1, label: 'El gallo', imageId: 'image-du-gallo' }],
      }));

    const ids = await inTenant(tenantId, ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    expect(ids, 'une image encore referencee doit figurer dans la liste').toEqual(['image-du-gallo']);
  });

  it('ne rend aucun id quand aucune carte ne porte d image', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    await inTenant(tenantId, ownerId, () =>
      decks.create({
        name: 'Jeu sans images', isTemplate: false, createdBy: ownerId,
        cards: [{ rank: 1, label: 'El gallo', imageId: null }],
      }));

    const ids = await inTenant(tenantId, ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    // ⛔ Et surtout pas `[null]` : un `null` dans la liste des references
    // ferait un `notIn: [null]`, dont le resultat en SQL n est pas celui qu on
    // lit naivement.
    expect(ids).toEqual([]);
  });

  it('dedoublonne une image partagee par deux cartes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    await inTenant(tenantId, ownerId, () =>
      decks.create({
        name: 'Jeu', isTemplate: false, createdBy: ownerId,
        cards: [
          { rank: 1, label: 'El gallo', imageId: 'partagee' },
          { rank: 2, label: 'El diablito', imageId: 'partagee' },
        ],
      }));

    const ids = await inTenant(tenantId, ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    expect(ids).toEqual(['partagee']);
  });

  it('ne voit pas les cartes d un autre locataire', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const decks = new PrismaDeckRepository();
    await inTenant(voisin.tenantId, voisin.ownerId, () =>
      decks.create({
        name: 'Jeu du voisin', isTemplate: false, createdBy: voisin.ownerId,
        cards: [{ rank: 1, label: 'El gallo', imageId: 'image-du-voisin' }],
      }));

    const ids = await inTenant(chezNous.tenantId, chezNous.ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    expect(ids, 'le cloisonnement vaut aussi pour les references').toEqual([]);
  });
});
