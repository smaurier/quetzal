import { type PatternKey } from './pattern.js';
import { describe, it, expect } from 'vitest';
import {
  parsePatternList,
  serializePatternList,
  isValidPatternList,
  patternAt,
  isLastPattern,
  patternProgress,
} from './pattern-list.js';
import { InvalidPatternListError, PatternIndexOutOfRangeError } from './errors.js';

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
    // Décision D8 : rejouer la meme figure deux fois de suite n a pas de sens,
    // la seconde serait gagnee au tirage suivant par la meme equipe.
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

describe('la raison diagnostique', () => {
  it('nomme la raison et le sens de la traduction', () => {
    expect(() => parsePatternList('linea,inconnue')).toThrow(/cle inconnue\) en lecture/);
    expect(() => parsePatternList('linea,linea')).toThrow(/doublon\) en lecture/);
    expect(() => serializePatternList(['inconnue'] as unknown as PatternKey[])).toThrow(
      /cle inconnue\) en ecriture/,
    );
    expect(() => serializePatternList(['linea', 'linea'] as unknown as PatternKey[])).toThrow(
      /doublon\) en ecriture/,
    );
  });
});

describe('patternAt', () => {
  it('rend la figure en cours', () => {
    expect(patternAt(['linea', 'llena'], 0)).toBe('linea');
    expect(patternAt(['linea', 'llena'], 1)).toBe('llena');
  });

  it('leve plutot que de rendre undefined sur un index hors liste', () => {
    // `noUncheckedIndexedAccess` est actif : un acces nu rendrait
    // `PatternKey | undefined` et polluerait tous les appelants.
    expect(() => patternAt(['linea'], 1)).toThrow(PatternIndexOutOfRangeError);
    expect(() => patternAt(['linea'], -1)).toThrow(PatternIndexOutOfRangeError);
  });
});

describe('isLastPattern', () => {
  it('reconnait la derniere figure : la partie se terminera', () => {
    expect(isLastPattern(['linea', 'llena'], 1)).toBe(true);
  });

  it('reconnait une figure intermediaire : la partie continuera', () => {
    expect(isLastPattern(['linea', 'llena'], 0)).toBe(false);
  });

  it('une liste a une figure est toujours a sa derniere', () => {
    expect(isLastPattern(['linea'], 0)).toBe(true);
  });

  it('leve aussi sur un index hors liste, comme patternAt', () => {
    expect(() => isLastPattern(['linea'], 1)).toThrow(PatternIndexOutOfRangeError);
    expect(() => isLastPattern(['linea'], -1)).toThrow(PatternIndexOutOfRangeError);
  });
});

describe('patternProgress', () => {
  it('dit ou on en est, pour l ecran de l animatrice', () => {
    expect(patternProgress(['linea', 'esquinas', 'llena'], 1)).toEqual({
      current: 'esquinas',
      position: 2,
      total: 3,
    });
  });

  it('compte a partir de un, pas de zero : c est lu par un humain', () => {
    expect(patternProgress(['linea'], 0).position).toBe(1);
  });

  it('leve aussi sur un index hors liste, comme patternAt', () => {
    expect(() => patternProgress([], 0)).toThrow(PatternIndexOutOfRangeError);
    expect(() => patternProgress(['linea'], 1)).toThrow(PatternIndexOutOfRangeError);
  });
});
