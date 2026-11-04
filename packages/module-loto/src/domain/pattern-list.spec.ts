import { describe, it, expect } from 'vitest';
import { parsePatternList, serializePatternList, isValidPatternList } from './pattern-list.js';
import { InvalidPatternListError } from './errors.js';

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

  it('preserve l ordre des figures', () => {
    expect(parsePatternList('llena,linea')).toEqual(['llena', 'linea']);
  });

  it('rejette une cle inconnue plutot que de la propager', () => {
    // La valeur vient de la base, donc d un ecrit passe qui peut etre
    // anterieur a une suppression de figure. Mieux vaut lever ici que rendre
    // une cle que `matchesPattern` ne saurait pas honorer.
    expect(() => parsePatternList('linea,inconnue')).toThrow(InvalidPatternListError);
  });

  it('rejette une liste vide', () => {
    expect(() => parsePatternList('')).toThrow(InvalidPatternListError);
  });

  it('rejette aussi une liste qui ne contient que des virgules', () => {
    expect(() => parsePatternList(',,,')).toThrow(InvalidPatternListError);
  });

  it('rejette un separateur degenere', () => {
    // Sans ce test, un refactor « tolérer une virgule finale » passerait
    // inaperçu : le test n'existerait pas pour l'arrêter.
    expect(() => parsePatternList('linea,')).toThrow(InvalidPatternListError);
  });

  it('rejette un doublon venu de la base', () => {
    // Rejouer la meme figure deux fois de suite n a pas de sens, la seconde
    // serait gagnee au tirage suivant par la meme equipe.
    expect(() => parsePatternList('linea,linea')).toThrow(InvalidPatternListError);
    expect(() => parsePatternList('linea,esquinas,centro,llena,linea')).toThrow(InvalidPatternListError);
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

  it('refuse une liste vide', () => {
    // Écrire une liste invalide rend la partie illisible pour toujours :
    // chaque lecture suivante lèverait.
    expect(() => serializePatternList([])).toThrow(InvalidPatternListError);
  });

  it('refuse un doublon', () => {
    expect(() => serializePatternList(['linea', 'linea'])).toThrow(InvalidPatternListError);
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

  it('refuse un doublon', () => {
    expect(isValidPatternList(['linea', 'linea'])).toBe(false);
  });

  it('refuse une cle inconnue', () => {
    expect(isValidPatternList(['linea', 'inconnue'])).toBe(false);
  });
});
