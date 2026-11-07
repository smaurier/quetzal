import { describe, it, expect } from 'vitest';
import { GameNotFoundError, GameNotRunningError } from '../domain/errors.js';
import { TABLA_SIZE } from '../domain/pattern.js';
import { JoinGameUseCase } from './join-game.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';
import type { GameSettings } from '../domain/ports/game.repository.js';

const SETTINGS: GameSettings = { patterns: ['linea'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null };

async function build(overrides: { maxTeams?: number } = {}) {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS, maxTeams: overrides.maxTeams ?? SETTINGS.maxTeams },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: 54 }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new JoinGameUseCase(games, Math.random);
  return { games, game, useCase };
}

describe('JoinGameUseCase', () => {
  it('crée une équipe d un et lui donne une tabla de seize cartes', async () => {
    const { games, game, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.id).toBe(result.teamId);
    expect(teams[0]?.cardIds).toHaveLength(TABLA_SIZE);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana']);
  });

  it('ne tire la tabla que parmi les cartes figées de la partie', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    const frozenIds = (await games.frozenCards(game.id)).map((card) => card.id);
    const teams = await games.teams(game.id);
    for (const cardId of teams[0]!.cardIds) expect(frozenIds).toContain(cardId);
  });

  it('une reconnexion retrouve son équipe au lieu d en créer une seconde', async () => {
    const { games, game, useCase } = await build();

    const first = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    const second = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    expect(second.teamId).toBe(first.teamId);
    expect(second.created).toBe(false);
    expect(await games.teams(game.id)).toHaveLength(1);
  });

  it('une reconnexion fonctionne même une fois la partie commencée', async () => {
    const { games, game, useCase } = await build();
    const first = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await games.setStatus(game.id, 'running');

    const again = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    expect(again.teamId).toBe(first.teamId);
  });

  it('chaque arrivant forme sa propre équipe tant qu il reste de la place', async () => {
    const { games, game, useCase } = await build({ maxTeams: 3 });

    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });
    await useCase.execute({ gameId: game.id, guestId: 'g-3', displayName: 'Caro' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(3);
    expect(teams.map((t) => t.teamIndex)).toEqual([0, 1, 2]);
  });

  it('au-delà du maximum, l arrivant rejoint l équipe la moins remplie', async () => {
    const { games, game, useCase } = await build({ maxTeams: 2 });

    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });
    const third = await useCase.execute({ gameId: game.id, guestId: 'g-3', displayName: 'Caro' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(2);
    expect(third.created).toBe(false);
    expect(teams[0]?.id).toBe(third.teamId);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana', 'Caro']);
  });

  it('donne des tablas différentes aux équipes d une même partie', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });

    const teams = await games.teams(game.id);
    expect(teams[0]?.cardIds).not.toEqual(teams[1]?.cardIds);
  });

  it('deux entrées lancées de front sur une partie à une seule équipe rendent le même teamId', async () => {
    // maxTeams: 1 force la collision : les deux appels lisent la liste des
    // équipes vide avant que l un ou l autre n ait créé la sienne, et
    // décident donc chacun teamIndex 0. Sans traitement de la collision, deux
    // équipes distinctes naissent au même index — ce que la contrainte
    // d unicité refuserait en base (spec tâche 34, étape 4 ter).
    const { games, game, useCase } = await build({ maxTeams: 1 });

    const [a, b] = await Promise.all([
      useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' }),
      useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' }),
    ]);

    expect(a.teamId).toBe(b.teamId);
    expect(await games.teams(game.id)).toHaveLength(1);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(
      useCase.execute({ gameId: 'absent', guestId: 'g-1', displayName: 'Ana' }),
    ).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it('refuse un nouvel arrivant une fois la partie commencée', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'running');

    await expect(
      useCase.execute({ gameId: game.id, guestId: 'g-9', displayName: 'Retardataire' }),
    ).rejects.toBeInstanceOf(GameNotRunningError);
  });
});

/**
 * Issue #32 : le comportement au-delà de trente-cinq joueurs n'était pas mesuré.
 *
 * Il l'est maintenant, par `scripts/mesurer-la-charge.mjs`, et le résultat n'est
 * pas une latence mais un REFUS. Quarante téléphones lancés d'un coup, sur une
 * pile locale, le 07/11/2026 :
 *
 *   ENTRÉE — 6 invités entrés, 34 refusés
 *     motifs de refus : refus du serveur : TeamIndexCollisionError
 *
 * Le serveur n'est pas lent : les six qui entrent le font en 743 ms de médiane,
 * et la diffusion d'un tirage leur arrive en 43 ms. C'est l'ENTRÉE qui échoue.
 *
 * Le plafond de rattrapage valait 5, et son commentaire disait pour quoi il
 * avait été dimensionné : « trente téléphones ». Or le nombre de concurrents
 * réels n'est pas le nombre d'élèves — c'est le nombre d'équipes à créer, donc
 * `maxTeams`. Cinq essais pour vingt créations concurrentes ne peuvent pas
 * suffire, et une classe de quarante verrait trente-quatre élèves refusés.
 */
describe('JoinGameUseCase, une classe entière qui scanne en même temps', () => {
  it('fait entrer les vingt arrivants d une vague, sans en refuser un seul', async () => {
    const { games, game, useCase } = await build({ maxTeams: 20 });

    const resultats = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        useCase.execute({ gameId: game.id, guestId: `g-${i}`, displayName: `Eleve ${i}` }),
      ),
    );

    expect(resultats, 'aucun arrivant ne doit etre refuse').toHaveLength(20);
    expect(await games.teams(game.id), 'vingt equipes, une par arrivant').toHaveLength(20);
  });

  /**
   * Le cas de la classe de quarante : vingt équipes au plus, donc vingt
   * créations concurrentes puis vingt arrivants qui rejoignent l'existant.
   * C'est la première moitié qui se dispute l'index.
   */
  it('fait entrer quarante arrivants sur vingt equipes', async () => {
    const { games, game, useCase } = await build({ maxTeams: 20 });

    const resultats = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        useCase.execute({ gameId: game.id, guestId: `g-${i}`, displayName: `Eleve ${i}` }),
      ),
    );

    expect(resultats).toHaveLength(40);
    expect(await games.teams(game.id)).toHaveLength(20);
    expect(
      new Set(resultats.map((r) => r.teamId)).size,
      'les quarante se repartissent sur les vingt equipes',
    ).toBe(20);
  });
});
