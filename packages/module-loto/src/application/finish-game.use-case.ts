import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError } from '../domain/errors.js';
import { assertTransition } from '../domain/game-status.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

@Injectable()
export class FinishGameUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string }): Promise<GameState> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    assertTransition(game.status, 'finished');

    await this.games.setStatus(game.id, 'finished');
    await this.eventBus.emit('loto.game.finished', {
      gameId: game.id,
      wonByTeamId: null,
      pattern: game.settings.pattern,
      drawCount: game.lastDrawOrder,
    });

    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }
}
