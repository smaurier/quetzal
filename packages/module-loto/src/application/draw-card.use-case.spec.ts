import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, GameNotRunningError, NoCardsLeftError } from '../domain/errors.js';
import { DrawCardUseCase } from './draw-card.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build(cardCount = 54) {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: cardCount }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new DrawCardUseCase(games, bus as unknown as EventBus, Math.random);
  return { games, bus, game, useCase };
}

describe('DrawCardUseCase', () => {
  it('tire une carte du jeu figé et l enregistre au rang un', async () => {
    const { games, game, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id });

    expect(result.drawn).toBe(true);
    if (!result.drawn) throw new Error('inatteignable');
    expect(result.order).toBe(1);

    const frozenIds = (await games.frozenCards(game.id)).map((card) => card.id);
    expect(frozenIds).toContain(result.card.id);
    expect(await games.drawnCards(game.id)).toEqual([result.card.id]);
  });

  it('le premier tirage fait basculer la partie en running', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    expect((await games.findById(game.id))?.status).toBe('running');
  });

  it('publie game.started au premier tirage seulement, card.drawn à chaque fois', async () => {
    const { bus, game, useCase } = await build();

    await useCase.execute({ gameId: game.id });
    await useCase.execute({ gameId: game.id });

    expect(bus.names()).toEqual(['loto.game.started', 'loto.card.drawn', 'loto.card.drawn']);
  });

  it('ne tire jamais deux fois la même carte', async () => {
    const { games, game, useCase } = await build(20);

    for (let i = 0; i < 20; i++) await useCase.execute({ gameId: game.id });

    const drawn = await games.drawnCards(game.id);
    expect(drawn).toHaveLength(20);
    expect(new Set(drawn).size).toBe(20);
  });

  it('refuse de tirer quand toutes les cartes sont sorties', async () => {
    const { game, useCase } = await build(16);
    for (let i = 0; i < 16; i++) await useCase.execute({ gameId: game.id });

    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(NoCardsLeftError);
  });

  it('un double appui simultané reste sans effet plutôt qu erroné', async () => {
    const { games, game, useCase } = await build();
    // En base, c est une contrainte d unicité de Loto_Draw qui tranche entre
    // deux appuis simultanés, et le perdant reçoit false. En mémoire, on arme
    // cet échec — pré-insérer un tirage ne le reproduirait pas, puisque le cas
    // d usage lirait alors un rang déjà avancé et son insertion réussirait.
    games.failNextAppendDraw = true;

    const result = await useCase.execute({ gameId: game.id });

    expect(result.drawn).toBe(false);
    expect(await games.drawnCards(game.id)).toHaveLength(0);
    // Une course perdue ne doit surtout pas faire basculer la partie.
    expect((await games.findById(game.id))?.status).toBe('open');
  });

  it('répare une partie laissée en open alors que des cartes sont déjà sorties', async () => {
    const { games, bus, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.appendDraw(game.id, 1, frozen[0]!.id);
    // La partie est restée open : un incident a coupé entre le tirage et la
    // bascule. Sans réparation, canClaim refuse tout et la partie est ingagnable.
    expect((await games.findById(game.id))?.status).toBe('open');

    await useCase.execute({ gameId: game.id });

    expect((await games.findById(game.id))?.status).toBe('running');
    expect(bus.names()).toContain('loto.game.started');
  });

  it('refuse de tirer dans une partie en draft', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'draft');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse de tirer dans une partie terminée', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'finished');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
