import { describe, it, expect } from 'vitest';
import { DeckTooSmallError } from './errors.js';
import { generateTabla, projectTabla, MIN_DECK_SIZE } from './tabla.js';

const deck = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`);

/** Générateur déterministe : rend les valeurs fournies, puis boucle. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('MIN_DECK_SIZE', () => {
  it('vaut seize, la taille d une tabla', () => {
    expect(MIN_DECK_SIZE).toBe(16);
  });
});

describe('generateTabla', () => {
  it('rend seize cartes', () => {
    expect(generateTabla(deck(54), Math.random)).toHaveLength(16);
  });

  it('ne répète jamais une carte', () => {
    const tabla = generateTabla(deck(54), Math.random);
    expect(new Set(tabla).size).toBe(16);
  });

  it('ne rend que des cartes du jeu', () => {
    const cards = deck(54);
    for (const id of generateTabla(cards, Math.random)) {
      expect(cards).toContain(id);
    }
  });

  it('accepte un jeu de seize cartes exactement, et rend alors tout le jeu', () => {
    const cards = deck(16);
    expect([...generateTabla(cards, Math.random)].sort()).toEqual([...cards].sort());
  });

  it('refuse un jeu trop petit', () => {
    expect(() => generateTabla(deck(15), Math.random)).toThrow(DeckTooSmallError);
  });

  it('est reproductible à générateur identique', () => {
    const cards = deck(54);
    const a = generateTabla(cards, sequence([0.1, 0.9, 0.5, 0.3, 0.7]));
    const b = generateTabla(cards, sequence([0.1, 0.9, 0.5, 0.3, 0.7]));
    expect(a).toEqual(b);
  });

  it('produit des tablas différentes à générateurs différents', () => {
    const cards = deck(54);
    const a = generateTabla(cards, sequence([0.1, 0.2, 0.3]));
    const b = generateTabla(cards, sequence([0.9, 0.8, 0.7]));
    expect(a).not.toEqual(b);
  });
});

describe('projectTabla', () => {
  it('marque les cases dont la carte a été tirée', () => {
    const tabla = deck(16);
    const drawn = new Set(['c1', 'c16']);
    const grid = projectTabla(tabla, drawn);
    expect(grid[0]).toBe(true);
    expect(grid[15]).toBe(true);
    expect(grid[1]).toBe(false);
  });

  it('rend toujours seize cases', () => {
    expect(projectTabla(deck(16), new Set())).toHaveLength(16);
  });

  it('ignore les cartes tirées absentes de la tabla', () => {
    const grid = projectTabla(deck(16), new Set(['c99', 'c1']));
    expect(grid.filter(Boolean)).toHaveLength(1);
  });

  it('respecte l ordre de la tabla', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];
    const grid = projectTabla(cards, new Set(['c']));
    expect(grid[2]).toBe(true);
    expect(grid.filter(Boolean)).toHaveLength(1);
  });
});
