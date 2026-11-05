import { describe, it, expect } from 'vitest';
import type { EventBus, EventName } from '../module-contract.js';
import { emitLoto } from './loto.js';

/**
 * Ce que ce fichier garde, et ce qu il ne peut pas garder.
 *
 * `emitLoto` ne fait que transmettre : ces tests épinglent qu il transmet le
 * nom et la charge sans les altérer, et qu il attend bien la fin de l émission.
 *
 * Sa vraie valeur est au niveau des TYPES, et aucun test d exécution ne peut la
 * prouver — un champ manquant ne compile pas, donc le test ne s écrit pas. La
 * preuve se fait par mutation : retirer un champ d une charge, lancer
 * `pnpm --filter @quetzal/core typecheck`, et constater l échec. Fait le 05/11,
 * résultat dans le message du commit.
 */

function busEnregistreur() {
  const vus: { name: string; payload: unknown }[] = [];
  const bus = {
    async emit(name: EventName, payload: unknown) {
      vus.push({ name, payload });
    },
    on() {
      throw new Error('non utilise ici');
    },
  } as unknown as EventBus;
  return { bus, vus };
}

describe('emitLoto', () => {
  it('transmet le nom et la charge sans les alterer', async () => {
    const { bus, vus } = busEnregistreur();

    await emitLoto(bus, 'loto.pattern.won', {
      gameId: 'g-1',
      wonByTeamId: 't-1',
      pattern: 'linea',
      drawCount: 7,
    });

    expect(vus).toEqual([
      {
        name: 'loto.pattern.won',
        payload: { gameId: 'g-1', wonByTeamId: 't-1', pattern: 'linea', drawCount: 7 },
      },
    ]);
  });

  it('attend la fin de l emission', async () => {
    let fini = false;
    const bus = {
      async emit() {
        await new Promise((r) => setTimeout(r, 5));
        fini = true;
      },
      on() {
        throw new Error('non utilise ici');
      },
    } as unknown as EventBus;

    await emitLoto(bus, 'loto.card.drawn', { gameId: 'g-1', order: 1, cardId: 'c-1', label: 'El gallo' });

    expect(fini, 'une emission non attendue laisserait un abonne a mi-chemin').toBe(true);
  });

  it('accepte les cinq evenements du contrat', async () => {
    const { bus, vus } = busEnregistreur();

    await emitLoto(bus, 'loto.game.started', { gameId: 'g', deckId: 'd', pattern: 'linea', teamCount: 3 });
    await emitLoto(bus, 'loto.card.drawn', { gameId: 'g', order: 1, cardId: 'c', label: 'El gallo' });
    await emitLoto(bus, 'loto.claim.rejected', { gameId: 'g', teamId: 't', atDraw: 4, blockedUntilDraw: 7 });
    await emitLoto(bus, 'loto.game.finished', { gameId: 'g', wonByTeamId: null, pattern: 'llena', drawCount: 9 });
    await emitLoto(bus, 'loto.pattern.won', { gameId: 'g', wonByTeamId: 't', pattern: 'linea', drawCount: 5 });

    expect(vus.map((v) => v.name)).toEqual([
      'loto.game.started',
      'loto.card.drawn',
      'loto.claim.rejected',
      'loto.game.finished',
      'loto.pattern.won',
    ]);
  });
});
