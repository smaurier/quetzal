import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, InvalidGameTransitionError } from '../domain/errors.js';
import { FinishGameUseCase } from './finish-game.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build(status: 'draft' | 'open' | 'running' | 'finished' = 'running') {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.setStatus(game.id, status);
  const useCase = new FinishGameUseCase(games, bus as unknown as EventBus);
  return { games, bus, game, useCase };
}

describe('FinishGameUseCase', () => {
  it('arrête une partie en cours, sans gagnante', async () => {
    const { games, game, useCase } = await build('running');

    const finished = await useCase.execute({ gameId: game.id });

    expect(finished.status).toBe('finished');
    expect(finished.wonByTeamId).toBeNull();
    expect((await games.findById(game.id))?.status).toBe('finished');
  });

  it('referme une salle d attente que personne n a rejointe', async () => {
    const { game, useCase } = await build('open');
    const finished = await useCase.execute({ gameId: game.id });
    expect(finished.status).toBe('finished');
  });

  it('publie game.finished sans équipe gagnante', async () => {
    const { bus, game, useCase } = await build('running');
    await useCase.execute({ gameId: game.id });

    expect(bus.names()).toEqual(['loto.game.finished']);
    expect(bus.emitted[0]?.payload).toMatchObject({ wonByTeamId: null });
  });

  it('refuse d arrêter une partie encore en brouillon', async () => {
    const { game, useCase } = await build('draft');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
  });

  it('refuse d arrêter deux fois', async () => {
    const { game, useCase } = await build('running');
    await useCase.execute({ gameId: game.id });
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
