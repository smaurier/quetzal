import { type PatternKey } from './pattern.js';
import { describe, it, expect } from 'vitest';
import {
  parsePatternList,
  serializePatternList,
  isValidPatternList,
  patternAt,
  isLastPattern,
  patternProgress,
  patternsDeLaLigne,
  patternCouranteOuNull,
  estIndexDansLaListe,
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

describe('estIndexDansLaListe', () => {
  it('index 0 sur une liste d un, vrai', () => {
    expect(estIndexDansLaListe(['linea'], 0)).toBe(true);
  });

  it('index 1 sur une liste de deux, vrai', () => {
    expect(estIndexDansLaListe(['linea', 'llena'], 1)).toBe(true);
  });

  it('index egal a la longueur, faux', () => {
    expect(estIndexDansLaListe(['linea', 'llena'], 2)).toBe(false);
  });

  it('index negatif, faux', () => {
    expect(estIndexDansLaListe(['linea'], -1)).toBe(false);
  });

  it('index non entier, faux', () => {
    expect(estIndexDansLaListe(['linea', 'llena'], 1.5)).toBe(false);
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

describe('patternsDeLaLigne', () => {
  it('lit la liste quand la colonne est remplie', () => {
    expect(patternsDeLaLigne('linea,llena', 'linea')).toEqual(['linea', 'llena']);
  });

  it('replie sur la figure unique quand la liste est NULL', () => {
    // Une partie creee par l ancienne instance pendant la bascule.
    expect(patternsDeLaLigne(null, 'llena')).toEqual(['llena']);
  });

  it('leve si les deux colonnes sont inexploitables', () => {
    expect(() => patternsDeLaLigne(null, 'inexistante')).toThrow(InvalidPatternListError);
  });
});

describe('patternCouranteOuNull', () => {
  it('liste remplie, index 0, rend la premiere figure', () => {
    expect(patternCouranteOuNull('linea,llena', 'linea', 0)).toBe('linea');
  });

  it('liste remplie, index 1, rend la SECONDE figure et non la colonne gelee', () => {
    // C est le test qui prouve le defaut corrige dans list() : avant la
    // correction, list() lisait row.pattern (toujours 'linea', gele a la
    // creation) au lieu de suivre patternIndex.
    expect(patternCouranteOuNull('linea,llena', 'linea', 1)).toBe('llena');
  });

  it('liste NULL, replie sur la figure unique', () => {
    expect(patternCouranteOuNull(null, 'llena', 0)).toBe('llena');
  });

  it('liste corrompue, rend null plutot que de lever', () => {
    expect(patternCouranteOuNull(null, 'inexistante', 0)).toBeNull();
  });

  it('index hors liste, rend null plutot que de lever', () => {
    expect(patternCouranteOuNull('linea,llena', 'linea', 5)).toBeNull();
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
