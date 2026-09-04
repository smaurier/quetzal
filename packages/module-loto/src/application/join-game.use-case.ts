import { Injectable } from '@nestjs/common';
import { GameNotFoundError, GameNotRunningError, TeamIndexCollisionError } from '../domain/errors.js';
import { canJoin } from '../domain/game-status.js';
import { assignTeam } from '../domain/team-assignment.js';
import { generateUniqueTabla } from '../domain/tabla.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface JoinGameResult {
  teamId: string;
  created: boolean;
}

/**
 * Trente téléphones peuvent scanner le même QR dans la même minute (spec
 * tâche 34, étape 4 ter) : quelques essais suffisent, la contrainte de base
 * étant le point de sérialisation réel, pas cette borne.
 */
const MAX_TEAM_ASSIGNMENT_ATTEMPTS = 5;

@Injectable()
export class JoinGameUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly random: () => number,
  ) {}

  async execute(input: {
    gameId: string;
    guestId: string;
    displayName: string;
  }): Promise<JoinGameResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);

    // Idempotence AVANT le contrôle d état : une reconnexion doit aboutir même
    // une fois la partie commencée, sinon une coupure wifi exclut un élève.
    const existing = await this.games.findMember(input.gameId, input.guestId);
    if (existing !== null) return { teamId: existing.teamId, created: false };

    if (!canJoin(game.status)) throw new GameNotRunningError(game.status);

    let teamId: string;
    let created: boolean;

    // Deux entrées concurrentes peuvent lire la même liste d équipes avant que
    // l une ou l autre n ait écrit la sienne, et donc viser le même teamIndex.
    // La contrainte de base tranche : le perdant relit et rejoue l affectation
    // plutôt que d échouer (spec tâche 34, étape 4 ter).
    for (let attempt = 1; ; attempt++) {
      const teams = await this.games.teams(game.id);
      const decision = assignTeam(
        teams.map((team) => ({ id: team.id, memberCount: team.memberDisplayNames.length })),
        game.settings.maxTeams,
      );

      if (decision.kind === 'existing') {
        teamId = decision.teamId;
        created = false;
        break;
      }

      const frozen = await this.games.frozenCards(game.id);
      const tabla = generateUniqueTabla(
        frozen.map((card) => card.id),
        teams.map((team) => team.cardIds),
        this.random,
      );
      try {
        const team = await this.games.createTeam(game.id, { teamIndex: teams.length, cardIds: tabla });
        teamId = team.id;
        created = true;
        break;
      } catch (err) {
        if (err instanceof TeamIndexCollisionError && attempt < MAX_TEAM_ASSIGNMENT_ATTEMPTS) continue;
        throw err;
      }
    }

    await this.games.addMember({
      gameId: game.id,
      teamId,
      guestId: input.guestId,
      displayName: input.displayName,
    });

    return { teamId, created };
  }
}
