import { describe, it, expect } from 'vitest';
import { matchesPattern, isPatternKey, PATTERN_KEYS, type Grid, type PatternKey } from './pattern.js';

// Une grille se lit ligne par ligne : les cases 0 à 3 forment la première ligne.
function grid(...marked: number[]): Grid {
  const cells = new Array<boolean>(16).fill(false);
  for (const i of marked) cells[i] = true;
  return cells;
}

const EMPTY = grid();
const FULL = grid(...Array.from({ length: 16 }, (_, i) => i));

describe('PATTERN_KEYS', () => {
  it('énumère les quatre figures de la spec', () => {
    expect([...PATTERN_KEYS]).toEqual(['linea', 'esquinas', 'centro', 'llena']);
  });
});

describe('matchesPattern — linea', () => {
  it('reconnaît les quatre lignes', () => {
    expect(matchesPattern(grid(0, 1, 2, 3), 'linea')).toBe(true);
    expect(matchesPattern(grid(4, 5, 6, 7), 'linea')).toBe(true);
    expect(matchesPattern(grid(8, 9, 10, 11), 'linea')).toBe(true);
    expect(matchesPattern(grid(12, 13, 14, 15), 'linea')).toBe(true);
  });

  it('reconnaît les quatre colonnes', () => {
    expect(matchesPattern(grid(0, 4, 8, 12), 'linea')).toBe(true);
    expect(matchesPattern(grid(1, 5, 9, 13), 'linea')).toBe(true);
    expect(matchesPattern(grid(2, 6, 10, 14), 'linea')).toBe(true);
    expect(matchesPattern(grid(3, 7, 11, 15), 'linea')).toBe(true);
  });

  it('reconnaît les deux diagonales', () => {
    expect(matchesPattern(grid(0, 5, 10, 15), 'linea')).toBe(true);
    expect(matchesPattern(grid(3, 6, 9, 12), 'linea')).toBe(true);
  });

  it('refuse une ligne incomplète', () => {
    expect(matchesPattern(grid(0, 1, 2), 'linea')).toBe(false);
  });

  it('refuse quatre cases alignées sur rien', () => {
    expect(matchesPattern(grid(0, 1, 2, 7), 'linea')).toBe(false);
    expect(matchesPattern(grid(1, 4, 11, 14), 'linea')).toBe(false);
  });

  it('refuse une grille vide', () => {
    expect(matchesPattern(EMPTY, 'linea')).toBe(false);
  });
});

describe('matchesPattern — esquinas', () => {
  it('reconnaît les quatre coins', () => {
    expect(matchesPattern(grid(0, 3, 12, 15), 'esquinas')).toBe(true);
  });

  it('refuse trois coins sur quatre', () => {
    expect(matchesPattern(grid(0, 3, 12), 'esquinas')).toBe(false);
    expect(matchesPattern(grid(0, 3, 15), 'esquinas')).toBe(false);
  });

  it('accepte des coins accompagnés d’autres cases', () => {
    expect(matchesPattern(grid(0, 3, 12, 15, 5, 6), 'esquinas')).toBe(true);
  });
});

describe('matchesPattern — centro', () => {
  it('reconnaît le carré central', () => {
    expect(matchesPattern(grid(5, 6, 9, 10), 'centro')).toBe(true);
  });

  it('refuse un carré décalé', () => {
    expect(matchesPattern(grid(4, 5, 8, 9), 'centro')).toBe(false);
  });

  it('refuse trois cases du centre', () => {
    expect(matchesPattern(grid(5, 6, 9), 'centro')).toBe(false);
  });
});

describe('matchesPattern — llena', () => {
  it('reconnaît la grille complète', () => {
    expect(matchesPattern(FULL, 'llena')).toBe(true);
  });

  it('refuse quinze cases sur seize', () => {
    expect(matchesPattern(grid(...Array.from({ length: 15 }, (_, i) => i)), 'llena')).toBe(false);
  });
});

describe('matchesPattern — indépendance des figures', () => {
  it('une grille pleine satisfait toutes les figures', () => {
    for (const key of PATTERN_KEYS) {
      expect(matchesPattern(FULL, key satisfies PatternKey)).toBe(true);
    }
  });

  it('une grille vide n’en satisfait aucune', () => {
    for (const key of PATTERN_KEYS) {
      expect(matchesPattern(EMPTY, key)).toBe(false);
    }
  });
});

describe('isPatternKey', () => {
  it('accepte les quatre clés', () => {
    for (const key of PATTERN_KEYS) expect(isPatternKey(key)).toBe(true);
  });

  it('refuse une chaîne qui n est pas une figure', () => {
    expect(isPatternKey('carton')).toBe(false);
    expect(isPatternKey('')).toBe(false);
    expect(isPatternKey('LINEA')).toBe(false);
  });
});
