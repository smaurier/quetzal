import { describe, it, expect } from 'vitest';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import { RenameTeamUseCase } from './rename-team.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';
import type { GameSettings } from '../domain/ports/game.repository.js';

const SETTINGS: GameSettings = { patterns: ['linea'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null };

async function build() {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'REN001',
    settings: { ...SETTINGS },
  });
  const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: ['c-1'] });
  const useCase = new RenameTeamUseCase(games);
  return { games, game, team, useCase };
}

/**
 * Issue #29. Le cas d usage ne traduit rien et ne met en forme rien : il situe
 * l equipe dans SA partie, puis ecrit. Les deux verifications qui suivent sont
 * la raison d etre de ce fichier.
 */
describe('RenameTeamUseCase', () => {
  it('nomme une equipe', async () => {
    const { games, game, team, useCase } = await build();

    await useCase.execute({ gameId: game.id, teamId: team.id, name: 'Los jaguares' });

    const [relue] = await games.teams(game.id);
    expect(relue?.chosenName).toBe('Los jaguares');
  });

  it('efface le nom choisi quand on passe null', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, name: 'Los jaguares' });

    await useCase.execute({ gameId: game.id, teamId: team.id, name: null });

    const [relue] = await games.teams(game.id);
    expect(relue?.chosenName, 'effacer rend l equipe a son nom derive').toBeNull();
  });

  /**
   * ⛔ LA GARDE QUI COMPTE. Sans elle, l identifiant d equipe suffirait a
   * renommer l equipe de N IMPORTE QUELLE partie, y compris celle d un autre
   * enseignant du meme locataire : le cloisonnement Prisma borne au locataire,
   * pas a la partie. L equipe doit appartenir a la partie nommee dans l appel.
   */
  it('refuse une equipe qui n appartient pas a cette partie', async () => {
    const { games, game, useCase } = await build();
    const autre = await games.create({
      deckId: 'deck-2',
      createdBy: 'u-2',
      joinCode: 'REN002',
      settings: { ...SETTINGS },
    });
    const sienne = await games.createTeam(autre.id, { teamIndex: 0, cardIds: ['c-9'] });

    // On cite la PREMIERE partie, mais l equipe de la SECONDE.
    await expect(
      useCase.execute({ gameId: game.id, teamId: sienne.id, name: 'Pirates' }),
    ).rejects.toThrow(TeamNotFoundError);

    const [intacte] = await games.teams(autre.id);
    expect(intacte?.chosenName, 'l equipe du voisin ne doit pas avoir bouge').toBeNull();
  });

  it('refuse une partie qui n existe pas', async () => {
    const { team, useCase } = await build();

    await expect(
      useCase.execute({ gameId: 'fantome', teamId: team.id, name: 'Pirates' }),
    ).rejects.toThrow(GameNotFoundError);
  });

  it('refuse une equipe qui n existe pas', async () => {
    const { game, useCase } = await build();

    await expect(
      useCase.execute({ gameId: game.id, teamId: 'fantome', name: 'Pirates' }),
    ).rejects.toThrow(TeamNotFoundError);
  });
});
