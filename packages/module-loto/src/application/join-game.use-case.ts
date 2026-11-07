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
 * Combien de fois rejouer l affectation d équipe avant d abandonner.
 *
 * ⛔ CE NOMBRE N EST PAS UN RÉGLAGE, c est une conséquence. Il valait 5, avec
 * pour justification « trente téléphones peuvent scanner le même QR dans la
 * même minute ». Le dimensionnement portait sur la mauvaise grandeur : ce qui
 * se dispute l index, ce ne sont pas les élèves mais les CRÉATIONS d équipe, et
 * il y en a au plus `maxTeams`. Cinq essais pour vingt créations concurrentes
 * ne peuvent pas suffire.
 *
 * Mesure du 07/11 (issue #32, `scripts/mesurer-la-charge.mjs`), quarante
 * téléphones lancés d un coup : **6 entrés, 34 refusés**, tous sur
 * `TeamIndexCollisionError`. Le serveur n était pas lent — 743 ms de médiane
 * pour ceux qui entraient, 43 ms de diffusion — c est l entrée qui échouait.
 *
 * La borne se déduit donc de `maxTeams`, plus une marge : au pire, un arrivant
 * voit chacune des autres équipes se créer avant la sienne, puis réussit.
 * La marge couvre le cas où la dernière place part pendant qu il relit, ce qui
 * le fait basculer sur la branche « rejoindre l existant ».
 */
const MARGE_ESSAIS = 3;
const essaisMaximum = (maxTeams: number): number => maxTeams + MARGE_ESSAIS;

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
    const plafondEssais = essaisMaximum(game.settings.maxTeams);
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
        if (err instanceof TeamIndexCollisionError && attempt < plafondEssais) continue;
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
