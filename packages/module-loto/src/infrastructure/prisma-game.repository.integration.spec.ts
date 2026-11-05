import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore, getTenantScopedPrisma } from '@quetzal/core';
import { Prisma } from '@prisma/client';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { PrismaGameRepository } from './prisma-game.repository.js';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from './traditional-deck.js';
import { TeamIndexCollisionError } from '../domain/errors.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const SETTINGS = { patterns: ['linea'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null } as const;

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
    expect(reloaded?.settings.patterns).toEqual(['linea']);
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

  // Rétroactif (audit correcteur-labs) : le catch de appendDraw ne renvoie
  // false que sur P2002 (course bénigne, cf. commentaire du repo) et remonte
  // toute autre erreur. Ce chemin n était exercé nulle part — les tests
  // existants ne provoquent que des P2002 (rang/carte déjà tirés). Provoque
  // ici une vraie violation de contrainte contre le vrai Postgres du
  // conteneur : un gameId qui n existe pas viole la FK composite
  // (gameId, tenantId) → Loto_Game(id, tenantId), donc P2003, pas P2002.
  it('remonte une vraie panne Postgres au lieu de l avaler comme une collision bénigne', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const games = new PrismaGameRepository();

    const failure = inTenant(tenantId, ownerId, () => games.appendDraw('jeu-inexistant', 1, 'carte-inexistante'));

    await expect(failure).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(failure).rejects.toMatchObject({ code: 'P2003' });
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

  it('signale la collision quand deux équipes visent le même index, plutôt que d y échouer sans y aider', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));

    await expect(
      inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] })),
    ).rejects.toBeInstanceOf(TeamIndexCollisionError);

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams).toHaveLength(1);
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

  it('liste les parties du locataire, la plus récente d abord', async () => {
    const { tenantId, ownerId, games, deck } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.create({ deckId: deck.id, createdBy: ownerId, joinCode: 'ZZZ999', settings: { ...SETTINGS } }),
    );

    const list = await inTenant(tenantId, ownerId, () => games.list());

    expect(list).toHaveLength(2);
    expect(list[0]?.joinCode).toBe('ZZZ999');
    expect(list[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(list[1]!.createdAt.getTime());
  });

  it('ne liste jamais les parties d un autre locataire', async () => {
    await aGame();
    const other = await seedTenant();
    const games = new PrismaGameRepository();

    const list = await inTenant(other.tenantId, other.ownerId, () => games.list());
    expect(list).toEqual([]);
  });

  // Issue #40, tache 5 du plan. La langue est resolue UNE FOIS a la creation
  // et gelee sur la partie : elle doit donc survivre a un aller-retour en
  // base, sinon chaque ecran invite retomberait sur la sienne.
  it('ecrit et relit la langue imposee', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu langue', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'LANG01',
        settings: { patterns: ['linea'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: 'es' },
      }),
    );

    const reread = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reread?.settings.guestLocale).toBe('es');
  });

  // Le defaut, et le seul cas qui existe pour toutes les parties deja en
  // base : la migration ajoute une colonne nullable, pas une valeur.
  it('laisse la langue a null quand l option est decochee', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu sans langue', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'LANG02',
        settings: { patterns: ['linea'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    const reread = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reread?.settings.guestLocale).toBeNull();
  });

  // Issue #30, tache 5 du plan. L animatrice enchaine plusieurs figures dans
  // la meme partie : la liste doit survivre a un aller-retour en base, avec
  // son ordre.
  it('ecrit et relit une liste de figures', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu figures', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG001',
        settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    const reread = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reread?.settings.patterns).toEqual(['linea', 'llena']);
    expect(reread?.patternIndex).toBe(0);
  });

  it('avance l index une seule fois quand deux appels partent du meme', async () => {
    // Le defaut que le compare-and-set ferme : deux telephones reclamant au
    // meme tirage liraient tous deux l index 0. Un `++` ferait sauter une
    // figure. Ici le second appel doit rendre false et ne rien changer.
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu course', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );
    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG002',
        settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    const premier = await inTenant(tenantId, ownerId, () => games.advancePattern(game.id, 0));
    const second = await inTenant(tenantId, ownerId, () => games.advancePattern(game.id, 0));

    expect(premier).toBe(true);
    expect(second).toBe(false);
    expect((await inTenant(tenantId, ownerId, () => games.findById(game.id)))?.patternIndex).toBe(1);
  });

  it('enregistre la figure d une reclamation, et la retrouve au meme tirage', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));

    await inTenant(tenantId, ownerId, () =>
      games.recordClaim({ gameId: game.id, teamId: team.id, atDraw: 7, valid: true, pattern: 'linea' }),
    );

    expect(await inTenant(tenantId, ownerId, () => games.hasValidClaimAt(game.id, 7))).toBe(true);
    expect(await inTenant(tenantId, ownerId, () => games.hasValidClaimAt(game.id, 8))).toBe(false);
  });

  // Seul test qui garde la double ecriture de l issue #52 : tant que l
  // ancienne instance existe, elle ne connait que la colonne `pattern`.
  // Sans ce test, rien n empeche un refactor de ne plus l ecrire.
  it('ecrit la premiere figure dans la colonne pattern, pour la compatibilite descendante', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu retro', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG003',
        settings: { patterns: ['llena', 'linea'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    // Lecture par le client Prisma directement : le port n expose pas la
    // colonne `pattern`, et c est voulu (tache 5b la retirera). Ce test
    // d infrastructure a le droit de regarder sous le port.
    const row = await inTenant(tenantId, ownerId, () =>
      getTenantScopedPrisma().loto_Game.findFirst({ where: { id: game.id } }),
    );
    expect(row?.pattern).toBe('llena');
  });

  // Defaut trouve en relecture : list() lisait la colonne `pattern` (gelee a
  // la creation) au lieu de suivre patternIndex. Une fois la figure avancee,
  // le tableau de bord de l animatrice affichait encore la premiere figure.
  it('liste la figure en cours, pas la figure gelee a la creation', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu avance', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );
    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG004',
        settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    await inTenant(tenantId, ownerId, () => games.advancePattern(game.id, 0));

    const list = await inTenant(tenantId, ownerId, () => games.list());
    const entry = list.find((g) => g.id === game.id);
    expect(entry?.pattern).toBe('llena');
  });
});
