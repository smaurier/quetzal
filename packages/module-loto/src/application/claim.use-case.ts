import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { isWinningClaim } from '../domain/claim.js';
import { drawnCardIds } from '../domain/drawn-cards.js';
import { GameNotFoundError, GameNotRunningError, TeamBlockedError, TeamNotFoundError } from '../domain/errors.js';
import { canClaim } from '../domain/game-status.js';
import { blockUntil, isBlocked } from '../domain/penalty.js';
import { isLastPattern, patternAt } from '../domain/pattern-list.js';
import type { GameRepository } from '../domain/ports/game.repository.js';
import { emitLoto } from '@quetzal/core/events/loto';

/**
 * Ce qu une reclamation a produit. `valid` ne suffit pas a l appelant : une
 * reclamation valide peut terminer la partie, ou seulement faire passer a la
 * figure suivante, et la diffusion n est pas la meme.
 */
export type ClaimOutcome =
  | 'rejected'
  | 'pattern-won'
  | 'pattern-won-by-other'
  | 'game-finished';

export interface ClaimResult {
  valid: boolean;
  atDraw: number;
  blockedUntilDraw: number;
  outcome: ClaimOutcome;
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
    const pattern = patternAt(game.settings.patterns, game.patternIndex);

    const valid = isWinningClaim({
      tablaCardIds: team.cardIds,
      drawnCardIds: drawn,
      pattern,
    });

    await this.games.recordClaim({
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      valid,
      pattern,
    });

    if (valid) {
      if (isLastPattern(game.settings.patterns, game.patternIndex)) {
        await this.games.setStatus(game.id, 'finished', { wonByTeamId: team.id });
        await emitLoto(this.eventBus, 'loto.game.finished', {
          gameId: game.id,
          wonByTeamId: team.id,
          pattern,
          drawCount: game.lastDrawOrder,
        });
        return {
          valid: true,
          atDraw: game.lastDrawOrder,
          blockedUntilDraw: team.blockedUntilDraw,
          outcome: 'game-finished',
        };
      }

      // Compare-and-set : si quelqu un a avancé entre-temps, on n avance pas
      // deux fois. La victoire reste enregistrée, elle, par recordClaim. Si la
      // course est perdue (false), cette équipe n est ni gagnante de la figure
      // ni punie : elle avait raison une seconde trop tard (décision D5).
      const advanced = await this.games.advancePattern(game.id, game.patternIndex);
      if (!advanced) {
        return {
          valid: true,
          atDraw: game.lastDrawOrder,
          blockedUntilDraw: team.blockedUntilDraw,
          outcome: 'pattern-won-by-other',
        };
      }

      await this.games.setWinner(game.id, team.id);
      await emitLoto(this.eventBus, 'loto.pattern.won', {
        gameId: game.id,
        wonByTeamId: team.id,
        pattern,
        drawCount: game.lastDrawOrder,
      });
      return {
        valid: true,
        atDraw: game.lastDrawOrder,
        blockedUntilDraw: team.blockedUntilDraw,
        outcome: 'pattern-won',
      };
    }

    // Décision D5 : au tirage où une figure vient d être gagnée, une
    // réclamation ratée ne coûte rien. L équipe avait raison une seconde trop
    // tard, et la pénalité est mécanique, donc invisible et inannulable.
    if (await this.games.hasValidClaimAt(game.id, game.lastDrawOrder)) {
      return {
        valid: false,
        atDraw: game.lastDrawOrder,
        blockedUntilDraw: team.blockedUntilDraw,
        outcome: 'rejected',
      };
    }

    const blockedUntilDraw = blockUntil(game.lastDrawOrder, game.settings.falseClaimPenaltyDraws);
    await this.games.blockTeam(team.id, blockedUntilDraw);
    await emitLoto(this.eventBus, 'loto.claim.rejected', {
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      blockedUntilDraw,
    });
    return { valid: false, atDraw: game.lastDrawOrder, blockedUntilDraw, outcome: 'rejected' };
  }
}
