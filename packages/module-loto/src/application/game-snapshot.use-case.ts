import { Injectable } from '@nestjs/common';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import type { GameStatus } from '../domain/game-status.js';
import type { PatternKey } from '../domain/pattern.js';
import { teamNameFor, type TeamName } from '../domain/team-name.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface SnapshotGame {
  id: string;
  status: GameStatus;
  pattern: PatternKey;
  joinCode: string;
  maxTeams: number;
  falseClaimPenaltyDraws: number;
  lastDrawOrder: number;
  remainingCardCount: number;
  wonByTeamId: string | null;
}

export interface SnapshotTeam {
  id: string;
  name: TeamName;
  memberCount: number;
  blockedUntilDraw: number;
}

export interface SnapshotDraw {
  order: number;
  cardId: string;
  label: string;
}

export interface SnapshotTabla {
  teamId: string;
  cards: DeckCard[];
  markedCardIds: string[];
  blockedUntilDraw: number;
}

export interface GameSnapshot {
  game: SnapshotGame;
  teams: SnapshotTeam[];
  draws: SnapshotDraw[];
  tabla: SnapshotTabla | null;
}

@Injectable()
export class GameSnapshotUseCase {
  constructor(private readonly games: GameRepository) {}

  async execute(input: { gameId: string; teamId?: string }): Promise<GameSnapshot> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);

    const [frozen, teams, drawnCardIds] = await Promise.all([
      this.games.frozenCards(game.id),
      this.games.teams(game.id),
      this.games.drawnCards(game.id),
    ]);

    const byId = new Map(frozen.map((card) => [card.id, card]));

    const draws: SnapshotDraw[] = drawnCardIds.map((cardId, index) => ({
      order: index + 1,
      cardId,
      label: byId.get(cardId)?.label ?? '',
    }));

    let tabla: SnapshotTabla | null = null;
    if (input.teamId !== undefined) {
      const team = teams.find((candidate) => candidate.id === input.teamId);
      if (team === undefined) throw new TeamNotFoundError(input.teamId);
      tabla = {
        teamId: team.id,
        cards: team.cardIds.flatMap((cardId) => {
          const card = byId.get(cardId);
          return card === undefined ? [] : [card];
        }),
        markedCardIds: team.markedCardIds,
        blockedUntilDraw: team.blockedUntilDraw,
      };
    }

    return {
      game: {
        id: game.id,
        status: game.status,
        pattern: game.settings.pattern,
        joinCode: game.joinCode,
        maxTeams: game.settings.maxTeams,
        falseClaimPenaltyDraws: game.settings.falseClaimPenaltyDraws,
        lastDrawOrder: game.lastDrawOrder,
        remainingCardCount: frozen.length - drawnCardIds.length,
        wonByTeamId: game.wonByTeamId,
      },
      teams: teams.map((team) => ({
        id: team.id,
        name: teamNameFor({
          memberDisplayNames: team.memberDisplayNames,
          teamIndex: team.teamIndex,
        }),
        memberCount: team.memberDisplayNames.length,
        blockedUntilDraw: team.blockedUntilDraw,
      })),
      draws,
      tabla,
    };
  }
}
