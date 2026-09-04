import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import {
  GameNotFoundError,
  GameNotRunningError,
  TeamBlockedError,
  TeamNotFoundError,
} from '../domain/errors.js';
import { ClaimUseCase } from './claim.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;
const TABLA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];

async function build(penalty = 3) {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS, falseClaimPenaltyDraws: penalty },
  });
  await games.freezeCards(
    game.id,
    TABLA.map((label, i) => ({ rank: i + 1, label, imageId: null })),
  );
  await games.setStatus(game.id, 'running');
  const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: [...TABLA] });
  const useCase = new ClaimUseCase(games, bus as unknown as EventBus);
  return { games, bus, game, team, useCase };
}

/** Enregistre des tirages réels, comme le ferait le cas d usage de tirage. */
async function draw(games: FakeGameRepository, gameId: string, cardIds: string[]): Promise<void> {
  // Reprend après les tirages déjà enregistrés : appendDraw refuse un rang
  // déjà pris (course entre deux appuis), et repartir de zéro à chaque appel
  // percuterait les tirages d un appel précédent dans le même test.
  let order = games.draws.get(gameId)?.length ?? 0;
  for (const cardId of cardIds) await games.appendDraw(gameId, ++order, cardId);
}

describe('ClaimUseCase', () => {
  it('valide une réclamation appuyée sur une ligne réellement tirée', async () => {
    const { games, bus, game, team, useCase } = await build();
    await draw(games, game.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(true);
    const reloaded = await games.findById(game.id);
    expect(reloaded?.status).toBe('finished');
    expect(reloaded?.wonByTeamId).toBe(team.id);
    expect(bus.names()).toContain('loto.game.finished');
  });

  it('LE TEST QUI COMPTE : un marquage parfait sans aucun tirage ne gagne rien', async () => {
    const { games, game, team, useCase } = await build();
    // L équipe prétend avoir marqué une línea entière. Le serveur n a rien tiré.
    await games.setMarks(team.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(false);
    const reloaded = await games.findById(game.id);
    expect(reloaded?.status).toBe('running');
    expect(reloaded?.wonByTeamId).toBeNull();
  });

  it('un marquage falsifié coûte la pénalité, comme n importe quelle fausse réclamation', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await games.setMarks(team.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(false);
    expect(result.blockedUntilDraw).toBe(5);
    const teams = await games.teams(game.id);
    expect(teams[0]?.blockedUntilDraw).toBe(5);
  });

  it('publie claim.rejected sur une fausse réclamation', async () => {
    const { games, bus, game, team, useCase } = await build();
    await draw(games, game.id, ['a']);

    await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(bus.names()).toEqual(['loto.claim.rejected']);
    expect(bus.names()).not.toContain('loto.game.finished');
  });

  it('enregistre chaque réclamation, valide ou non', async () => {
    const { games, game, team, useCase } = await build();
    await draw(games, game.id, ['a']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(games.claims).toHaveLength(1);
    expect(games.claims[0]).toMatchObject({ teamId: team.id, atDraw: 1, valid: false });
  });

  it('refuse une réclamation tant que la pénalité court', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    await draw(games, game.id, ['c']);
    await expect(useCase.execute({ gameId: game.id, teamId: team.id })).rejects.toBeInstanceOf(TeamBlockedError);
  });

  it('libère l équipe au tirage de la borne', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    await draw(games, game.id, ['c', 'd', 'e']);
    const result = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(result.valid).toBe(true);
  });

  it('sans pénalité configurée, une fausse réclamation ne bloque rien', async () => {
    const { games, game, team, useCase } = await build(0);
    await draw(games, game.id, ['a']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(result.blockedUntilDraw).toBe(0);

    const again = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(again.valid).toBe(false);
  });

  it('refuse de réclamer dans une partie qui n est pas en cours', async () => {
    const { games, game, team, useCase } = await build();
    await games.setStatus(game.id, 'open');
    await expect(useCase.execute({ gameId: game.id, teamId: team.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(useCase.execute({ gameId: game.id, teamId: 'absent' })).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse une partie inconnue', async () => {
    const { team, useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent', teamId: team.id })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
