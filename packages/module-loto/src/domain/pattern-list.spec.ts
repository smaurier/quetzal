import { describe, it, expect } from 'vitest';
import { parsePatternList, serializePatternList, isValidPatternList } from './pattern-list.js';

describe('parsePatternList', () => {
  it('lit une liste de la base', () => {
    expect(parsePatternList('linea,llena')).toEqual(['linea', 'llena']);
  });

  it('lit une liste a une seule figure, le cas de toutes les parties existantes', () => {
    expect(parsePatternList('linea')).toEqual(['linea']);
  });

  it('ignore les espaces autour des cles', () => {
    expect(parsePatternList(' linea , llena ')).toEqual(['linea', 'llena']);
  });

  it('rejette une cle inconnue plutot que de la propager', () => {
    // La valeur vient de la base, donc d un ecrit passe qui peut etre
    // anterieur a une suppression de figure. Mieux vaut lever ici que rendre
    // une cle que `matchesPattern` ne saurait pas honorer.
    expect(() => parsePatternList('linea,inconnue')).toThrow();
    expect(() => parsePatternList('')).toThrow();
  });

  it('rejette aussi un doublon et une liste trop longue', () => {
    // `parsePatternList` garantit une liste valide, c est elle qui lit la
    // base : elle refuse donc tout ce que `isValidPatternList` refuse, pas
    // seulement les cles inconnues.
    expect(() => parsePatternList('linea,linea')).toThrow();
    expect(() => parsePatternList('linea,esquinas,centro,llena,linea')).toThrow();
  });
});

describe('serializePatternList', () => {
  it('ecrit une liste pour la base', () => {
    expect(serializePatternList(['linea', 'llena'])).toBe('linea,llena');
  });

  it('fait un aller-retour sans perte', () => {
    expect(parsePatternList(serializePatternList(['esquinas', 'centro', 'llena']))).toEqual([
      'esquinas',
      'centro',
      'llena',
    ]);
  });
});

describe('isValidPatternList', () => {
  it('accepte de une a quatre figures', () => {
    expect(isValidPatternList(['linea'])).toBe(true);
    expect(isValidPatternList(['linea', 'esquinas', 'centro', 'llena'])).toBe(true);
  });

  it('refuse une liste vide', () => {
    expect(isValidPatternList([])).toBe(false);
  });

  // Decision D8 : rejouer la meme figure deux fois de suite n a pas de sens,
  // la seconde serait gagnee au tirage suivant par la meme equipe.
  it('refuse un doublon', () => {
    expect(isValidPatternList(['linea', 'linea'])).toBe(false);
  });

  it('refuse une cle inconnue', () => {
    expect(isValidPatternList(['linea', 'inconnue'])).toBe(false);
  });
});
