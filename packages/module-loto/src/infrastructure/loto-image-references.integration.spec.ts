import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { LotoImageReferences } from './loto-image-references.js';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { PrismaGameRepository } from './prisma-game.repository.js';

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

  /**
   * ⛔ LES CARTES GELEES COMPTENT AUSSI. Issue #85.
   *
   * `Loto_GameCard` porte sa propre colonne `imageId` : c est la carte FIGEE au
   * lancement d une partie (D5 du loto, pour qu une correction du jeu ne change
   * pas le sens d une partie en cours). Ce fournisseur ne lisait que
   * `Loto_Card`, donc ces images etaient invisibles au ramassage.
   *
   * Le scenario qui perd des donnees : Elda modifie le jeu pendant qu une
   * partie tourne, la carte quitte `Loto_Card`, `deleteOrphans` ne voit plus
   * personne la referencer, et l image est DETRUITE alors que les tablas des
   * eleves la montrent encore.
   *
   * Le test reproduit exactement ca : l image n est plus que sur la carte
   * gelee.
   */
  it('rend l id d une image que seule une carte GELEE reference encore', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    const games = new PrismaGameRepository();

    // Un jeu dont la carte porte l image, et une partie qui la gele.
    const jeu = await inTenant(tenantId, ownerId, () =>
      decks.create({
        name: 'Jeu joue', isTemplate: false, createdBy: ownerId,
        cards: [{ rank: 1, label: 'El gallo', imageId: 'image-de-la-partie' }],
      }));
    const partie = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: jeu.id, createdBy: ownerId, joinCode: 'GELEE001',
        settings: { patterns: ['llena'], maxTeams: 2, falseClaimPenaltyDraws: 0, guestLocale: null },
      }));
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(partie.id, [{ rank: 1, label: 'El gallo', imageId: 'image-de-la-partie' }]));

    // Puis Elda corrige son jeu et retire l image de la carte vivante. C est
    // le geste qui declenche le ramassage dans `manage-decks.use-case.ts`,
    // et apres lui plus aucune `Loto_Card` ne porte cette image.
    await inTenant(tenantId, ownerId, () =>
      decks.updateCard(jeu.id, 1, { imageId: null }));

    const ids = await inTenant(tenantId, ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    expect(
      ids,
      'une image encore portee par une carte gelee ne doit JAMAIS etre ramassee',
    ).toEqual(['image-de-la-partie']);
  });

  /**
   * Et sans dedoublonner entre les deux tables : la meme image sert la carte
   * vivante ET sa copie gelee, ce qui est le cas NORMAL pendant une partie.
   */
  it('dedoublonne une image portee a la fois par une carte vivante et sa copie gelee', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    const games = new PrismaGameRepository();

    const jeu = await inTenant(tenantId, ownerId, () =>
      decks.create({
        name: 'Jeu en cours', isTemplate: false, createdBy: ownerId,
        cards: [{ rank: 1, label: 'El gallo', imageId: 'image-partagee' }],
      }));
    const partie = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: jeu.id, createdBy: ownerId, joinCode: 'GELEE002',
        settings: { patterns: ['llena'], maxTeams: 2, falseClaimPenaltyDraws: 0, guestLocale: null },
      }));
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(partie.id, [{ rank: 1, label: 'El gallo', imageId: 'image-partagee' }]));

    const ids = await inTenant(tenantId, ownerId, () =>
      new LotoImageReferences().referencedImageIds());

    expect(ids).toEqual(['image-partagee']);
  });
});
