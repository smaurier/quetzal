import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { DeckNotFoundError, DeckTooSmallError, GameNotFoundError } from '../domain/errors.js';
import { assertTransition } from '../domain/game-status.js';
import { MIN_DECK_SIZE } from '../domain/tabla.js';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

@Injectable()
export class OpenGameUseCase {
  constructor(
    private readonly decks: DeckRepository,
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string }): Promise<GameState> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    assertTransition(game.status, 'open');

    const deck = await this.decks.findById(game.deckId);
    if (deck === null) throw new DeckNotFoundError(game.deckId);
    if (deck.cards.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deck.cards.length);

    await this.games.freezeCards(
      game.id,
      deck.cards.map((card) => ({ rank: card.rank, label: card.label, imageId: card.imageId })),
    );
    await this.games.setStatus(game.id, 'open');

    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }
}
