import { describe, it, expect } from 'vitest';
import { generateTabla } from './tabla.js';
import { isWinningClaim } from './claim.js';
import { blockUntil, isBlocked } from './penalty.js';
import { canClaim, canDraw, canJoin } from './game-status.js';

const DECK = Array.from({ length: 54 }, (_, i) => `card-${i + 1}`);

describe('une partie entière, jouée en mémoire', () => {
  it('se déroule du premier tirage à la victoire sur une ligne', () => {
    const tabla = generateTabla(DECK, Math.random);
    const drawn = new Set<string>();
    let order = 0;

    expect(canJoin('open')).toBe(true);
    expect(canDraw('open')).toBe(true);

    const firstRow = tabla.slice(0, 4);
    for (const card of firstRow) {
      order += 1;
      drawn.add(card);
    }

    expect(canClaim('running')).toBe(true);
    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: drawn, pattern: 'linea' })).toBe(true);
    expect(order).toBe(4);
  });

  it('rejette une réclamation prématurée puis bloque l équipe trois tours', () => {
    const tabla = generateTabla(DECK, Math.random);
    const drawn = new Set<string>([tabla[0]!, tabla[1]!, tabla[2]!]);
    const currentOrder = 3;

    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: drawn, pattern: 'linea' })).toBe(false);

    const blocked = blockUntil(currentOrder, 3);
    expect(blocked).toBe(6);
    expect(isBlocked(blocked, 4)).toBe(true);
    expect(isBlocked(blocked, 6)).toBe(false);
  });

  it('ne valide jamais une réclamation appuyée sur des cartes non tirées', () => {
    const tabla = generateTabla(DECK, Math.random);
    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: new Set(), pattern: 'llena' })).toBe(false);
  });
});
