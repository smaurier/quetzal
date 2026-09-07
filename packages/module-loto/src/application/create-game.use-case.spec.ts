import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import {
  DeckNotFoundError,
  DeckTooSmallError,
  InvalidTeamLimitError,
  JoinCodeUnavailableError,
} from '../domain/errors.js';
import { JOIN_CODE_LENGTH } from '../domain/join-code.js';
import { CreateGameUseCase } from './create-game.use-case.js';
import { FakeDeckRepository, FakeGameRepository, RecordingEventBus, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

function build(random: () => number = Math.random) {
  const decks = new FakeDeckRepository();
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const useCase = new CreateGameUseCase(decks, games, bus as unknown as EventBus, random);
  return { decks, games, bus, useCase };
}

describe('CreateGameUseCase', () => {
  it('crée une partie à l état draft avec un code d entrée', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    const game = await useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } });

    expect(game.status).toBe('draft');
    expect(game.joinCode).toHaveLength(JOIN_CODE_LENGTH);
    expect(game.settings.maxTeams).toBe(6);
  });

  it('refuse un jeu de cartes inconnu', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ deckId: 'absent', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('refuse un jeu de moins de seize cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(15));
    await expect(
      useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(DeckTooSmallError);
  });

  it('refuse un maximum d équipes inférieur à un', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    await expect(
      useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS, maxTeams: 0 } }),
    ).rejects.toBeInstanceOf(InvalidTeamLimitError);
  });

  it('retente quand le code d entrée est déjà pris', async () => {
    const codes = ['AAA222', 'AAA222', 'BBB333'];
    let call = 0;
    const { decks, games } = build();
    decks.add(deckOf(54));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const withFixedCodes = new CreateGameUseCase(
      decks,
      games,
      new RecordingEventBus() as unknown as EventBus,
      Math.random,
      () => codes[call++ % codes.length]!,
    );

    const game = await withFixedCodes.execute({
      deckId: 'deck-1',
      createdBy: 'u-1',
      settings: { ...SETTINGS },
    });
    expect(game.joinCode).toBe('BBB333');
  });

  it('abandonne après un nombre borné de codes déjà pris', async () => {
    const { decks, games } = build();
    decks.add(deckOf(54));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const alwaysTaken = new CreateGameUseCase(
      decks,
      games,
      new RecordingEventBus() as unknown as EventBus,
      Math.random,
      () => 'AAA222',
    );

    await expect(
      alwaysTaken.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(JoinCodeUnavailableError);
  });

  it('ne publie aucun événement : rien n a encore commencé', async () => {
    const { decks, bus, useCase } = build();
    decks.add(deckOf(54));
    await useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } });
    expect(bus.names()).toEqual([]);
  });
});
