import { describe, it, expect } from 'vitest';
import { DeckTooSmallError, TablaGenerationExhaustedError } from './errors.js';
import {
  generateTabla,
  generateUniqueTabla,
  projectTabla,
  MIN_DECK_SIZE,
  MAX_TABLA_GENERATION_ATTEMPTS,
} from './tabla.js';

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

describe('generateUniqueTabla', () => {
  it('se comporte comme generateTabla avec un jeu de 54 cartes et aucune tabla existante', () => {
    const cards = deck(54);
    const tabla = generateUniqueTabla(cards, [], Math.random);
    expect(tabla).toHaveLength(16);
    expect(new Set(tabla).size).toBe(16);
    for (const id of tabla) {
      expect(cards).toContain(id);
    }
  });

  // Seize cartes est le cas piégeux : avec un jeu de taille minimale, generateTabla
  // rend TOUJOURS l'intégralité du jeu (voir le test dédié ci-dessus) donc toute tabla
  // contient le même ENSEMBLE de seize cartes. Comparer des ensembles ferait donc
  // collisionner toute paire de tablas et boucler indéfiniment. L'unicité doit porter
  // sur la SÉQUENCE ordonnée : il y a 16! (~2·10^13) ordres distincts, largement de
  // quoi servir six équipes sans jamais épuiser le budget de tentatives.
  it('avec un jeu de seize cartes exactement, sert six équipes de suite sans jamais bloquer, avec des tablas distinctes en ordre mais identiques en ensemble', () => {
    const cards = deck(16);
    const tablas: string[][] = [];
    for (let team = 0; team < 6; team++) {
      const tabla = generateUniqueTabla(cards, tablas, Math.random);
      tablas.push(tabla);
    }

    expect(tablas).toHaveLength(6);
    for (const tabla of tablas) {
      expect([...tabla].sort()).toEqual([...cards].sort());
    }
    for (let i = 0; i < tablas.length; i++) {
      for (let j = i + 1; j < tablas.length; j++) {
        expect(tablas[i]).not.toEqual(tablas[j]);
      }
    }
  });

  it('détecte une collision avec un générateur déterministe puis diverge au retirage', () => {
    const cards = deck(54);
    const drawSeq = [0.1, 0.9, 0.5, 0.3, 0.7];
    const existing = generateTabla(cards, sequence(drawSeq));

    // Les seize premiers appels rejouent exactement drawSeq (donc reproduisent `existing`,
    // collision garantie) ; les seize suivants divergent pour le retirage.
    const firstAttempt = Array.from({ length: 16 }, (_, i) => drawSeq[i % drawSeq.length]!);
    const secondAttempt = firstAttempt.map((v) => (v + 0.41) % 1);
    const collideThenDiverge = sequence([...firstAttempt, ...secondAttempt]);

    const result = generateUniqueTabla(cards, [existing], collideThenDiverge);
    expect(result).not.toEqual(existing);
    expect(new Set(result).size).toBe(16);
  });

  it(
    'épuise le budget de tentatives et lève TablaGenerationExhaustedError plutôt que de boucler indéfiniment',
    () => {
      const cards = deck(16);
      const alwaysSame = sequence([0]);
      const existing = generateTabla(cards, alwaysSame);

      let caught: unknown;
      try {
        generateUniqueTabla(cards, [existing], alwaysSame);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(TablaGenerationExhaustedError);
      expect((caught as Error).name).toBe('TablaGenerationExhaustedError');
      expect((caught as Error).message).toContain(String(MAX_TABLA_GENERATION_ATTEMPTS));
    },
    1000,
  );
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
