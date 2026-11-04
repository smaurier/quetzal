import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from './traditional-deck.js';

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

describe('PrismaDeckRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('crée un jeu avec ses cartes et le relit', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();

    const created = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: TRADITIONAL_DECK_NAME, isTemplate: true, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    expect(created.cards).toHaveLength(54);
    expect(created.isTemplate).toBe(true);

    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(created.id));
    expect(reloaded?.cards[0]?.label).toBe('El gallo');
    expect(reloaded?.cards[53]?.rank).toBe(54);
  });

  it('rend les cartes triées par rang', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({
        name: 'Désordre', isTemplate: false, createdBy: ownerId,
        cards: [
          { rank: 3, label: 'Trois', imageId: null },
          { rank: 1, label: 'Un', imageId: null },
          { rank: 2, label: 'Deux', imageId: null },
        ],
      }),
    );
    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(deck.id));
    expect(reloaded?.cards.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('liste les jeux avec le nombre de cartes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'A', isTemplate: false, createdBy: ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );
    const list = await inTenant(tenantId, ownerId, () => repo.list());
    expect(list).toHaveLength(1);
    expect(list[0]?.cardCount).toBe(1);
  });

  it('modifie le nom d une carte sans toucher aux autres', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({
        name: 'Mien', isTemplate: false, createdBy: ownerId,
        cards: [
          { rank: 1, label: 'El gallo', imageId: null },
          { rank: 2, label: 'El diablito', imageId: null },
        ],
      }),
    );

    await inTenant(tenantId, ownerId, () => repo.updateCard(deck.id, 1, { label: 'El gallito' }));

    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(deck.id));
    expect(reloaded?.cards[0]?.label).toBe('El gallito');
    expect(reloaded?.cards[1]?.label).toBe('El diablito');
  });

  it('supprime un jeu et ses cartes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Jetable', isTemplate: false, createdBy: ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );

    await inTenant(tenantId, ownerId, () => repo.delete(deck.id));

    expect(await inTenant(tenantId, ownerId, () => repo.findById(deck.id))).toBeNull();
    expect(await inTenant(tenantId, ownerId, () => repo.list())).toHaveLength(0);
  });

  it('ne voit jamais le jeu d un autre locataire', async () => {
    const a = await seedTenant('A');
    const b = await seedTenant('B');
    const repo = new PrismaDeckRepository();

    await inTenant(a.tenantId, a.ownerId, () =>
      repo.create({ name: 'Secret de A', isTemplate: false, createdBy: a.ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );

    expect(await inTenant(b.tenantId, b.ownerId, () => repo.list())).toHaveLength(0);
  });

  // Issue #26, le coeur du defaut : `updateCard` passe par un `updateMany`,
  // qui ne touche AUCUNE ligne quand le rang n existe pas encore. Les tests
  // unitaires ne peuvent pas l attraper, ils parlent au faux depot.
  it('insere une carte dans un jeu vierge, et elle est relue', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const vierge = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Jeu vierge', isTemplate: false, createdBy: ownerId, cards: [] }),
    );

    const carte = await inTenant(tenantId, ownerId, () =>
      repo.addCard(vierge.id, { rank: 1, label: 'El Gallo', imageId: null }),
    );

    const relu = await inTenant(tenantId, ownerId, () => repo.findById(vierge.id));
    expect(relu?.cards).toHaveLength(1);
    expect(relu?.cards[0]?.id).toBe(carte.id);
    expect(relu?.cards[0]?.label).toBe('El Gallo');
    expect(relu?.cardCount).toBe(1);
  });

  // L ancien chemin, garde en regard : il ne cree rien et ne crie pas. C est
  // ce silence qui a fait croire que le bouton etait casse cote interface.
  it('updateCard sur un rang absent ne cree rien, et ne leve pas', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const vierge = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Jeu vierge', isTemplate: false, createdBy: ownerId, cards: [] }),
    );

    await inTenant(tenantId, ownerId, () => repo.updateCard(vierge.id, 1, { label: 'El Gallo' }));

    expect((await inTenant(tenantId, ownerId, () => repo.findById(vierge.id)))?.cards).toHaveLength(0);
  });

  // La garantie est plus forte qu un simple << rien ne se passe >> : la cle
  // etrangere composite Loto_Card_deckId_tenantId_fkey REFUSE l insertion. L
  // extension de cloisonnement pose le tenantId de B, et le couple
  // (deck de A, tenant B) n existe pas dans Loto_Deck. Mesure, pas supposition.
  it('la base refuse une carte posee dans le jeu d un autre locataire', async () => {
    const a = await seedTenant('A');
    const b = await seedTenant('B');
    const repo = new PrismaDeckRepository();
    const deckA = await inTenant(a.tenantId, a.ownerId, () =>
      repo.create({ name: 'Jeu de A', isTemplate: false, createdBy: a.ownerId, cards: [] }),
    );

    await expect(
      inTenant(b.tenantId, b.ownerId, () =>
        repo.addCard(deckA.id, { rank: 1, label: 'Intrus', imageId: null }),
      ),
    ).rejects.toMatchObject({ code: 'P2003' });

    expect((await inTenant(a.tenantId, a.ownerId, () => repo.findById(deckA.id)))?.cards).toHaveLength(0);
  });
});
