import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { isWinningClaim } from '../domain/claim.js';
import { drawnCardIds } from '../domain/drawn-cards.js';
import { GameNotFoundError, GameNotRunningError, TeamBlockedError, TeamNotFoundError } from '../domain/errors.js';
import { canClaim } from '../domain/game-status.js';
import { blockUntil, isBlocked } from '../domain/penalty.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface ClaimResult {
  valid: boolean;
  atDraw: number;
  blockedUntilDraw: number;
}

@Injectable()
export class ClaimUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string; teamId: string }): Promise<ClaimResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    if (!canClaim(game.status)) throw new GameNotRunningError(game.status);

    const teams = await this.games.teams(game.id);
    const team = teams.find((candidate) => candidate.id === input.teamId);
    if (team === undefined) throw new TeamNotFoundError(input.teamId);
    if (isBlocked(team.blockedUntilDraw, game.lastDrawOrder)) {
      throw new TeamBlockedError(team.blockedUntilDraw);
    }

    // Décision D1. `team.markedCardIds` est juste là, du même type, et n est
    // pas lu. Le brand DrawnCardId fait que le confondre avec ceci ne compile
    // pas : c est la seule protection structurelle de cet invariant.
    const drawn = drawnCardIds(await this.games.drawnCards(game.id));

    const valid = isWinningClaim({
      tablaCardIds: team.cardIds,
      drawnCardIds: drawn,
      pattern: game.settings.pattern,
    });

    await this.games.recordClaim({
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      valid,
    });

    if (valid) {
      await this.games.setStatus(game.id, 'finished', { wonByTeamId: team.id });
      await this.eventBus.emit('loto.game.finished', {
        gameId: game.id,
        wonByTeamId: team.id,
        pattern: game.settings.pattern,
        drawCount: game.lastDrawOrder,
      });
      return { valid: true, atDraw: game.lastDrawOrder, blockedUntilDraw: team.blockedUntilDraw };
    }

    const blockedUntilDraw = blockUntil(game.lastDrawOrder, game.settings.falseClaimPenaltyDraws);
    await this.games.blockTeam(team.id, blockedUntilDraw);
    await this.eventBus.emit('loto.claim.rejected', {
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      blockedUntilDraw,
    });
    return { valid: false, atDraw: game.lastDrawOrder, blockedUntilDraw };
  }
}
