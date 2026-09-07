import { describe, it, expect } from 'vitest';
import { isBlocked, blockUntil, NO_PENALTY } from './penalty.js';

describe('blockUntil', () => {
  it('sans pénalité configurée, ne bloque rien', () => {
    expect(blockUntil(12, 0)).toBe(NO_PENALTY);
  });

  it('bloque jusqu au tirage courant plus la pénalité', () => {
    expect(blockUntil(12, 3)).toBe(15);
  });

  it('accepte une pénalité volontairement énorme, qui écarte l équipe de fait', () => {
    expect(blockUntil(12, 9999)).toBe(10011);
  });
});

describe('isBlocked', () => {
  it('ne bloque pas quand aucune pénalité ne court', () => {
    expect(isBlocked(NO_PENALTY, 12)).toBe(false);
  });

  it('bloque tant que le tirage courant est strictement inférieur à la borne', () => {
    expect(isBlocked(15, 12)).toBe(true);
    expect(isBlocked(15, 14)).toBe(true);
  });

  it('libère l équipe au tirage de la borne', () => {
    expect(isBlocked(15, 15)).toBe(false);
    expect(isBlocked(15, 16)).toBe(false);
  });
});
