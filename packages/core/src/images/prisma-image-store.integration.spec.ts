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
import type { ImageReferenceProvider } from './image-store.js';

/**
 * Même forme que le `LotoPrisma` de `prisma-image-store.ts`, qu'elle imite :
 * arguments en `Record<string, unknown>`, et le client Prisma cloisonné n'est
 * pas typé plus finement parce que `@prisma/client` n'est qu'une
 * `devDependency` du noyau, choix délibéré pour ne pas coupler le noyau à la
 * surface complète du client généré.
 */
interface LotoDeckCardPrisma {
  loto_Deck: { create(args: Record<string, unknown>): Promise<unknown> };
  loto_Card: {
    createMany(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<{ imageId: string | null }[]>;
  };
}

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

/**
 * Ce que le module loto porte desormais lui-meme
 * (`module-loto/src/infrastructure/loto-image-references.ts`), recopie ici a la
 * main. Le noyau ne peut pas importer un module (CLAUDE.md §3, sens interdit),
 * et ces tests veulent un consommateur qui REFERENCE vraiment en base, pas une
 * doublure qui se contente de le dire.
 */
const referencesDesCartesDeLoto: ImageReferenceProvider = {
  async referencedImageIds(): Promise<readonly string[]> {
    const prisma = getTenantScopedPrisma() as unknown as LotoDeckCardPrisma;
    const cartes = await prisma.loto_Card.findMany({
      where: { imageId: { not: null } },
      select: { imageId: true },
    });
    return [
      ...new Set(cartes.map((carte) => carte.imageId).filter((id): id is string => id !== null)),
    ];
  },
};

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
    const store = new PrismaCardImageStore([referencesDesCartesDeLoto]);

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
    const store = new PrismaCardImageStore([referencesDesCartesDeLoto]);

    const partagee = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    const orpheline = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: AUTRE }));

    // Insertion directe plutot que PrismaDeckRepository : ce test vit dans le
    // noyau, et le noyau ne depend pas du module loto (sens interdit, §3).
    // deleteOrphans ne lit plus aucune table de module : c est le fournisseur
    // ci-dessus qui la lit, donc ce test reproduit la meme table a la main.
    //
    // ⚠️ `loto_Deck` n est PAS un sujet de ce test, et deleteOrphans ne la lit
    // jamais : elle n est la que pour satisfaire la cle etrangere
    // `Loto_Card.deckId`, sans quoi le createMany echouerait en violation de
    // contrainte. Aucune logique de jeu de cartes n est verifiee ici.
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
  /**
   * ⛔ LE TEST QUI COMPTE. Le ramassage ne voyait que les cartes de loto. Un
   * second module qui reference la meme table perdrait toutes ses images a la
   * premiere suppression de jeu, sans message et sans trace.
   *
   * Pas besoin du module quiz pour l ecrire : un fournisseur de references
   * ecrit a la main tient le role du second consommateur, et c est MIEUX : le
   * test ne depend d aucun module, donc il garde aussi le troisieme.
   */
  it('garde une image que seul un AUTRE consommateur reference', async () => {
    const { tenantId, ownerId } = await seedTenant();

    const gardee = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).put({
        mimeType: 'image/png',
        bytes: new Uint8Array([9, 9, 9]),
      }));

    const voisin: ImageReferenceProvider = {
      async referencedImageIds() {
        return [gardee.id];
      },
    };
    const store = new PrismaCardImageStore([voisin]);

    const supprimees = await inTenant(tenantId, ownerId, () => store.deleteOrphans());

    expect(supprimees, 'aucune image a ramasser').toBe(0);
    expect(
      await inTenant(tenantId, ownerId, () => store.findByHash(gardee.contentHash)),
      "l image d un autre module ne doit pas etre ramassee").not.toBeNull();
  });

  /**
   * ⛔ LE SECOND PIEGE, et il est pire que le premier. `notIn: []` ne protege
   * RIEN : il supprime toute la table. Un hote mal cable, aucun fournisseur
   * enregistre, effacerait donc toutes les images de tous les modules, et
   * passerait pour un ramassage reussi.
   */
  it('ne supprime RIEN quand aucun consommateur n est enregistre', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const image = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).put({
        mimeType: 'image/png',
        bytes: new Uint8Array([7, 7]),
      }));

    const supprimees = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).deleteOrphans());

    expect(supprimees, 'un registre vide est une panne de cablage, pas un vide').toBe(0);
    expect(
      await inTenant(tenantId, ownerId, () =>
        new PrismaCardImageStore([]).findByHash(image.contentHash))).not.toBeNull();
  });
  /**
   * ⛔ TOUS les consommateurs sont consultes, pas le premier.
   *
   * Ajoute apres mesure : la mutation qui remplace
   * `this.fournisseurs.map(...)` par `this.fournisseurs.slice(0, 1).map(...)`
   * laissait les deux tests ci-dessus VERTS, parce qu ils n ont qu un seul
   * fournisseur chacun. Un garde qu on n a pas vu rougir ne garde rien, donc en
   * voici un ou seul le SECOND fournisseur reference l image.
   */
  it('consulte TOUS les consommateurs, pas seulement le premier', async () => {
    const { tenantId, ownerId } = await seedTenant();

    const gardee = await inTenant(tenantId, ownerId, () =>
      new PrismaCardImageStore([]).put({
        mimeType: 'image/png',
        bytes: new Uint8Array([4, 4, 4]),
      }));

    const premierSansRien: ImageReferenceProvider = {
      async referencedImageIds() {
        return [];
      },
    };
    const secondQuiReference: ImageReferenceProvider = {
      async referencedImageIds() {
        return [gardee.id];
      },
    };
    const store = new PrismaCardImageStore([premierSansRien, secondQuiReference]);

    const supprimees = await inTenant(tenantId, ownerId, () => store.deleteOrphans());

    expect(supprimees, 'rien a ramasser : le second consommateur la reference').toBe(0);
    expect(
      await inTenant(tenantId, ownerId, () => store.findByHash(gardee.contentHash)),
      "s arreter au premier consommateur detruit les images de tous les suivants").not.toBeNull();
  });

});
