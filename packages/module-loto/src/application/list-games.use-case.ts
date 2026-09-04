import { Injectable } from '@nestjs/common';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameSummary } from '../domain/ports/game.repository.js';

export interface GameHistoryEntry extends GameSummary {
  deckName: string | null;
}

@Injectable()
export class ListGamesUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly decks: DeckRepository,
  ) {}

  async execute(): Promise<GameHistoryEntry[]> {
    const list = await this.games.list();

    const names = new Map<string, string | null>();
    for (const deckId of new Set(list.map((game) => game.deckId))) {
      const deck = await this.decks.findById(deckId);
      names.set(deckId, deck?.name ?? null);
    }

    return list.map((game) => ({ ...game, deckName: names.get(game.deckId) ?? null }));
  }
}
