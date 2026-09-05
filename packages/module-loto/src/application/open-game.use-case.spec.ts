import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { DeckNotFoundError, GameNotFoundError, InvalidGameTransitionError } from '../domain/errors.js';
import { OpenGameUseCase } from './open-game.use-case.js';
import { FakeDeckRepository, FakeGameRepository, RecordingEventBus, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build() {
  const decks = new FakeDeckRepository();
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  decks.add(deckOf(54));
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  const useCase = new OpenGameUseCase(decks, games, bus as unknown as EventBus);
  return { decks, games, bus, game, useCase };
}

describe('OpenGameUseCase', () => {
  it('fige les cartes du jeu et passe la partie à open', async () => {
    const { games, game, useCase } = await build();

    const opened = await useCase.execute({ gameId: game.id });

    expect(opened.status).toBe('open');
    expect(await games.frozenCards(game.id)).toHaveLength(54);
  });

  it('copie le libellé et le rang de chaque carte, pas une référence', async () => {
    const { decks, games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });

    await decks.updateCard('deck-1', 1, { label: 'Renommée après coup' });

    const frozen = await games.frozenCards(game.id);
    expect(frozen[0]?.label).toBe('Carta 1');
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it('refuse de rouvrir une partie déjà ouverte', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
    expect((await games.findById(game.id))?.status).toBe('open');
  });

  it('refuse quand le jeu de cartes a disparu entre-temps', async () => {
    const { decks, game, useCase } = await build();
    await decks.delete('deck-1');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('ne publie aucun événement : la partie n a pas encore commencé', async () => {
    const { bus, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    expect(bus.names()).toEqual([]);
  });
});
