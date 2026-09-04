import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { PrismaGameRepository } from './prisma-game.repository.js';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from './traditional-deck.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

describe('PrismaGameRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  async function aGame() {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    const games = new PrismaGameRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: TRADITIONAL_DECK_NAME, isTemplate: true, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );
    const game = await inTenant(tenantId, ownerId, () =>
      games.create({ deckId: deck.id, createdBy: ownerId, joinCode: 'ABC234', settings: { ...SETTINGS } }),
    );
    return { tenantId, ownerId, decks, games, deck, game };
  }

  it('crée une partie à l état draft et la relit par son code d entrée', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    expect(game.status).toBe('draft');
    expect(game.lastDrawOrder).toBe(0);
    expect(game.settings.maxTeams).toBe(6);

    const byCode = await inTenant(tenantId, ownerId, () => games.findByJoinCode('ABC234'));
    expect(byCode?.id).toBe(game.id);
  });

  it('retype status et pattern au lieu de rendre des chaînes nues', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.status).toBe('draft');
    expect(reloaded?.settings.pattern).toBe('linea');
  });

  it('fige les cartes du jeu et les relit triées par rang', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );

    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));
    expect(frozen).toHaveLength(54);
    expect(frozen[0]?.rank).toBe(1);
    expect(frozen[0]?.label).toBe('El gallo');
    expect(frozen[53]?.rank).toBe(54);
  });

  it('une carte ne sort qu une fois, et un deuxième appui est sans effet', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );
    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));
    const first = frozen[0]!;

    const ok = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, first.id));
    expect(ok).toBe(true);

    const sameRank = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, frozen[1]!.id));
    expect(sameRank).toBe(false);

    const sameCard = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 2, first.id));
    expect(sameCard).toBe(false);

    const drawn = await inTenant(tenantId, ownerId, () => games.drawnCards(game.id));
    expect(drawn).toEqual([first.id]);
  });

  it('lastDrawOrder suit le dernier tirage', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );
    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));

    await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, frozen[0]!.id));
    await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 2, frozen[1]!.id));

    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.lastDrawOrder).toBe(2);
  });

  it('crée une équipe, y ajoute un membre et rend les noms des membres', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    const team = await inTenant(tenantId, ownerId, () =>
      games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2'] }),
    );
    expect(team.teamIndex).toBe(0);
    expect(team.memberDisplayNames).toEqual([]);
    expect(team.cardIds).toEqual(['c1', 'c2']);
    expect(team.markedCardIds).toEqual([]);

    await inTenant(tenantId, ownerId, () =>
      games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' }),
    );

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams).toHaveLength(1);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana']);
  });

  it('rend les équipes triées par teamIndex, pas par ordre d insertion', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 2, cardIds: [] }));
    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));
    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 1, cardIds: [] }));

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams.map((t) => t.teamIndex)).toEqual([0, 1, 2]);
  });

  it('retrouve un invité déjà entré, ce qui rend la reconnexion idempotente', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));
    await inTenant(tenantId, ownerId, () =>
      games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' }),
    );

    const found = await inTenant(tenantId, ownerId, () => games.findMember(game.id, 'g-1'));
    expect(found?.teamId).toBe(team.id);

    const absent = await inTenant(tenantId, ownerId, () => games.findMember(game.id, 'g-2'));
    expect(absent).toBeNull();
  });

  it('enregistre marquages et blocage sans les confondre', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () =>
      games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2', 'c3'] }),
    );

    await inTenant(tenantId, ownerId, () => games.setMarks(team.id, ['c1', 'c3']));
    await inTenant(tenantId, ownerId, () => games.blockTeam(team.id, 15));

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams[0]?.markedCardIds).toEqual(['c1', 'c3']);
    expect(teams[0]?.cardIds).toEqual(['c1', 'c2', 'c3']);
    expect(teams[0]?.blockedUntilDraw).toBe(15);
  });

  it('bascule le statut et retient l équipe gagnante', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));

    await inTenant(tenantId, ownerId, () => games.setStatus(game.id, 'open'));
    await inTenant(tenantId, ownerId, () => games.setStatus(game.id, 'finished', { wonByTeamId: team.id }));

    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.status).toBe('finished');
    expect(reloaded?.wonByTeamId).toBe(team.id);
  });

  it('cloisonne les parties entre locataires', async () => {
    const { game } = await aGame();
    const other = await seedTenant();
    const games = new PrismaGameRepository();

    const leaked = await inTenant(other.tenantId, other.ownerId, () => games.findById(game.id));
    expect(leaked).toBeNull();

    const leakedByCode = await inTenant(other.tenantId, other.ownerId, () => games.findByJoinCode('ABC234'));
    expect(leakedByCode).toBeNull();
  });
});
