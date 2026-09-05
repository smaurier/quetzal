import { describe, it, expect } from 'vitest';
import { isWinningClaim } from './claim.js';
import { drawnCardIds } from './drawn-cards.js';

const TABLA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];

describe('isWinningClaim', () => {
  it('valide une ligne réellement tirée', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: drawnCardIds(['a', 'b', 'c', 'd']),
      pattern: 'linea',
    })).toBe(true);
  });

  it('refuse une ligne incomplète', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: drawnCardIds(['a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide le carton plein', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: drawnCardIds(TABLA),
      pattern: 'llena',
    })).toBe(true);
  });

  it('ne tient aucun compte des cartes tirées absentes de la tabla', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: drawnCardIds(['x', 'y', 'z', 'a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('refuse une réclamation quand rien n a été tiré', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: drawnCardIds([]),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide indépendamment de l ordre des tirages', () => {
    const a = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: drawnCardIds(['a', 'b', 'c', 'd']), pattern: 'linea' });
    const b = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: drawnCardIds(['d', 'c', 'b', 'a']), pattern: 'linea' });
    expect(a).toBe(b);
  });

  it('accepte à la compilation un ensemble construit par drawnCardIds', () => {
    expect(() =>
      isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: drawnCardIds(['a']), pattern: 'linea' }),
    ).not.toThrow();
  });

  it('rejette à la compilation un ReadonlySet<string> qui n a pas transité par drawnCardIds', () => {
    // @ts-expect-error D1 : seule drawnCardIds() peut produire ce que le serveur a réellement tiré.
    isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: new Set(['a']), pattern: 'linea' });
    expect(true).toBe(true);
  });
});
