import { describe, it, expect } from 'vitest';
import { isWinningClaim } from './claim.js';

const TABLA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];

describe('isWinningClaim', () => {
  it('valide une ligne réellement tirée', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['a', 'b', 'c', 'd']),
      pattern: 'linea',
    })).toBe(true);
  });

  it('refuse une ligne incomplète', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide le carton plein', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(TABLA),
      pattern: 'llena',
    })).toBe(true);
  });

  it('ne tient aucun compte des cartes tirées absentes de la tabla', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['x', 'y', 'z', 'a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('refuse une réclamation quand rien n a été tiré', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide indépendamment de l ordre des tirages', () => {
    const a = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: new Set(['a', 'b', 'c', 'd']), pattern: 'linea' });
    const b = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: new Set(['d', 'c', 'b', 'a']), pattern: 'linea' });
    expect(a).toBe(b);
  });
});
