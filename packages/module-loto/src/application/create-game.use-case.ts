import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import {
  DeckNotFoundError,
  DeckTooSmallError,
  InvalidTeamLimitError,
  JoinCodeUnavailableError,
} from '../domain/errors.js';
import { generateJoinCode } from '../domain/join-code.js';
import { MIN_DECK_SIZE } from '../domain/tabla.js';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameSettings, GameState } from '../domain/ports/game.repository.js';

export const MAX_JOIN_CODE_ATTEMPTS = 20;

export interface CreateGameInput {
  deckId: string;
  createdBy: string;
  settings: GameSettings;
}

@Injectable()
export class CreateGameUseCase {
  constructor(
    private readonly decks: DeckRepository,
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
    private readonly random: () => number,
    private readonly makeJoinCode: () => string = () => generateJoinCode(this.random),
  ) {}

  async execute(input: CreateGameInput): Promise<GameState> {
    if (input.settings.maxTeams < 1) throw new InvalidTeamLimitError(input.settings.maxTeams);

    const deck = await this.decks.findById(input.deckId);
    if (deck === null) throw new DeckNotFoundError(input.deckId);
    if (deck.cards.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deck.cards.length);

    const joinCode = await this.freeJoinCode();
    return this.games.create({
      deckId: deck.id,
      createdBy: input.createdBy,
      joinCode,
      settings: input.settings,
    });
  }

  private async freeJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const candidate = this.makeJoinCode();
      if ((await this.games.findByJoinCode(candidate)) === null) return candidate;
    }
    throw new JoinCodeUnavailableError(MAX_JOIN_CODE_ATTEMPTS);
  }
}
