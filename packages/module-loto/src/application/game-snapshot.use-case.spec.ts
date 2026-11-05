import { describe, it, expect } from 'vitest';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import { GameSnapshotUseCase } from './game-snapshot.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';
import type { GameSettings } from '../domain/ports/game.repository.js';

const SETTINGS: GameSettings = { patterns: ['linea'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null };

async function build() {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new GameSnapshotUseCase(games);
  return { games, game, useCase };
}

describe('GameSnapshotUseCase', () => {
  it('rend l état de la partie et ses réglages', async () => {
    const { game, useCase } = await build();

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.game.status).toBe('open');
    expect(snapshot.game.joinCode).toBe('AAA222');
    expect(snapshot.game.pattern).toBe('linea');
    expect(snapshot.game.remainingCardCount).toBe(20);
  });

  it('rend les cartes tirées dans l ordre du tirage', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.appendDraw(game.id, 1, frozen[4]!.id);
    await games.appendDraw(game.id, 2, frozen[0]!.id);

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.draws.map((draw) => draw.label)).toEqual(['Carta 5', 'Carta 1']);
    expect(snapshot.game.remainingCardCount).toBe(18);
  });

  it('nomme une équipe d un du nom de son membre', async () => {
    const { games, game, useCase } = await build();
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: [] });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.teams[0]?.name).toEqual({ kind: 'member', displayName: 'Ana' });
    expect(snapshot.teams[0]?.memberCount).toBe(1);
  });

  it('numérote une équipe dès qu elle compte plusieurs membres', async () => {
    const { games, game, useCase } = await build();
    const team = await games.createTeam(game.id, { teamIndex: 2, cardIds: [] });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-2', displayName: 'Beto' });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.teams[0]?.name).toEqual({ kind: 'numbered', number: 3 });
    expect(snapshot.teams[0]?.memberCount).toBe(2);
  });

  it('sans équipe demandée, ne rend aucune tabla', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.createTeam(game.id, { teamIndex: 0, cardIds: frozen.slice(0, 16).map((c) => c.id) });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.tabla).toBeNull();
  });

  it('avec une équipe, rend sa tabla, ses marquages et son blocage', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    const cardIds = frozen.slice(0, 16).map((card) => card.id);
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds });
    await games.setMarks(team.id, [cardIds[0]!, cardIds[3]!]);
    await games.blockTeam(team.id, 15);

    const snapshot = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(snapshot.tabla?.cards).toHaveLength(16);
    expect(snapshot.tabla?.cards[0]?.label).toBe('Carta 1');
    expect(snapshot.tabla?.markedCardIds).toEqual([cardIds[0], cardIds[3]]);
    expect(snapshot.tabla?.blockedUntilDraw).toBe(15);
  });

  it('rend la tabla dans l ordre de la tabla, pas dans celui du jeu', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    const cardIds = [...frozen.slice(0, 16).map((card) => card.id)].reverse();
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds });

    const snapshot = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(snapshot.tabla?.cards.map((card) => card.id)).toEqual(cardIds);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(useCase.execute({ gameId: game.id, teamId: 'absent' })).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });

  // Issue #40. L ecran de l animatrice construit le lien d entree depuis
  // l instantane : si la langue gelee sur la partie n y figure pas, le lien
  // ne peut pas la transporter et chaque telephone retombe sur la sienne.
  // Aplatie comme maxTeams et falseClaimPenaltyDraws : SnapshotGame n a pas
  // d objet `settings`, contrairement a ce que le plan supposait.
  it('transporte la langue gelee sur la partie', async () => {
    const { games, useCase } = await build();
    const game = await games.create({
      deckId: 'deck-1',
      createdBy: 'u-1',
      joinCode: 'LANG01',
      settings: { ...SETTINGS, guestLocale: 'es' },
    });
    await games.freezeCards(game.id, [{ rank: 1, label: 'Carta 1', imageId: null }]);

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.game.guestLocale).toBe('es');
  });

  it('transporte la figure en cours et la progression', async () => {
    const { games, useCase } = await build();
    const game = await games.create({
      deckId: 'deck-1',
      createdBy: 'u-1',
      joinCode: 'FIG003',
      settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null },
    });
    await games.freezeCards(game.id, [{ rank: 1, label: 'Carta 1', imageId: null }]);
    await games.advancePattern(game.id, 0);

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.game.pattern).toBe('llena');
    expect(snapshot.game.patternPosition).toBe(2);
    expect(snapshot.game.patternTotal).toBe(2);
  });
});
