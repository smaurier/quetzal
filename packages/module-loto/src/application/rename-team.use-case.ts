import { Injectable } from '@nestjs/common';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

/**
 * Nommer une equipe (issue #29).
 *
 * Le nom arrive deja valide : la route le borne avec Zod avant d appeler ici,
 * et le domaine (`teamNameFor`) traite un nom blanc comme une absence. Ce cas
 * d usage ne met donc rien en forme — il situe l equipe, puis il ecrit.
 */
@Injectable()
export class RenameTeamUseCase {
  constructor(private readonly games: GameRepository) {}

  async execute(input: { gameId: string; teamId: string; name: string | null }): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);

    /**
     * ⛔ L APPARTENANCE, et ce n est pas une precaution de style. Le
     * cloisonnement Prisma borne au LOCATAIRE, pas a la partie : sans cette
     * verification, un identifiant d equipe suffirait a renommer l equipe de
     * n importe quelle partie du meme locataire, donc celle d un autre
     * enseignant. C est au cas d usage de borner a la partie.
     */
    const teams = await this.games.teams(input.gameId);
    if (!teams.some((team) => team.id === input.teamId)) {
      throw new TeamNotFoundError(input.teamId);
    }

    await this.games.renameTeam(input.teamId, input.name);
  }
}
