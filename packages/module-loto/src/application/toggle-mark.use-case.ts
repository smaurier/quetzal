import { Injectable } from '@nestjs/common';
import {
  CardNotOnTablaError,
  GameNotFoundError,
  GameNotRunningError,
  TeamNotFoundError,
} from '../domain/errors.js';
import { canMark } from '../domain/game-status.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface ToggleMarkResult {
  teamId: string;
  cardId: string;
  marked: boolean;
  markedCardIds: string[];
}

/**
 * Décision D2 : ce cas d usage écrit un état partagé sans autorité. Aucune
 * décision de jeu ne lit ce qu il écrit — la réclamation part des seuls
 * tirages du serveur. Ajouter ici une validation « la carte a-t-elle été
 * tirée » donnerait au marquage une autorité qu il ne doit pas avoir.
 */
@Injectable()
export class ToggleMarkUseCase {
  constructor(private readonly games: GameRepository) {}

  async execute(input: {
    gameId: string;
    teamId: string;
    cardId: string;
    marked: boolean;
  }): Promise<ToggleMarkResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    if (!canMark(game.status)) throw new GameNotRunningError(game.status);

    const teams = await this.games.teams(game.id);
    const team = teams.find((candidate) => candidate.id === input.teamId);
    if (team === undefined) throw new TeamNotFoundError(input.teamId);
    if (!team.cardIds.includes(input.cardId)) throw new CardNotOnTablaError(input.cardId);

    const without = team.markedCardIds.filter((cardId) => cardId !== input.cardId);
    const markedCardIds = input.marked ? [...without, input.cardId] : without;
    await this.games.setMarks(team.id, markedCardIds);

    return { teamId: team.id, cardId: input.cardId, marked: input.marked, markedCardIds };
  }
}
