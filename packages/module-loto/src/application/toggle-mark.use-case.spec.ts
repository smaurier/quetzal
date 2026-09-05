import { describe, it, expect } from 'vitest';
import { CardNotOnTablaError, GameNotRunningError, TeamNotFoundError } from '../domain/errors.js';
import { ToggleMarkUseCase } from './toggle-mark.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build() {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.setStatus(game.id, 'running');
  const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2', 'c3'] });
  const useCase = new ToggleMarkUseCase(games);
  return { games, game, team, useCase };
}

describe('ToggleMarkUseCase', () => {
  it('marque une case de la tabla', async () => {
    const { games, game, team, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    expect(result.marked).toBe(true);
    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual(['c2']);
  });

  it('démarque une case déjà marquée', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: false });

    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual([]);
  });

  it('marquer deux fois la même case ne la duplique pas', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual(['c2']);
  });

  it('refuse une carte absente de la tabla de l équipe', async () => {
    const { game, team, useCase } = await build();
    await expect(
      useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c99', marked: true }),
    ).rejects.toBeInstanceOf(CardNotOnTablaError);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(
      useCase.execute({ gameId: game.id, teamId: 'absent', cardId: 'c1', marked: true }),
    ).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse de marquer dans une partie terminée', async () => {
    const { games, game, team, useCase } = await build();
    await games.setStatus(game.id, 'finished');
    await expect(
      useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c1', marked: true }),
    ).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('ne touche jamais aux cartes de la tabla en écrivant un marquage', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c1', marked: true });

    const teams = await games.teams(game.id);
    expect(teams[0]?.cardIds).toEqual(['c1', 'c2', 'c3']);
  });
});
