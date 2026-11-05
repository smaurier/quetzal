import { isPatternKey, type PatternKey } from './pattern.js';
import { InvalidPatternListError, PatternIndexOutOfRangeError } from './errors.js';

export type PatternListProblem =
  | 'aucun' | 'liste vide' | 'separateur degenere' | 'doublon' | 'cle inconnue';

function patternListProblem(list: readonly string[]): PatternListProblem {
  if (list.every((key) => key === '')) return 'liste vide';
  if (list.some((key) => key === '')) return 'separateur degenere';
  if (new Set(list).size !== list.length) return 'doublon';
  if (!list.every(isPatternKey)) return 'cle inconnue';
  return 'aucun';
}

export function isValidPatternList(list: readonly string[]): list is PatternKey[] {
  return patternListProblem(list) === 'aucun';
}

/**
 * La base stocke une chaine (`CLAUDE.md` §9 : pas d enum Postgres, et un
 * tableau Postgres serait disproportionne pour quatre cles courtes). Le port
 * expose un tableau : la traduction vit ici, et nulle part ailleurs.
 */
export function parsePatternList(raw: string): PatternKey[] {
  const keys = raw.split(',').map((key) => key.trim());
  if (!isValidPatternList(keys)) {
    throw new InvalidPatternListError('lecture', JSON.stringify(raw), patternListProblem(keys));
  }
  return keys;
}

export function serializePatternList(list: readonly PatternKey[]): string {
  if (!isValidPatternList(list)) {
    throw new InvalidPatternListError('ecriture', JSON.stringify(list), patternListProblem(list));
  }
  return list.join(',');
}

export function patternAt(list: readonly PatternKey[], index: number): PatternKey {
  const key = list[index];
  if (key === undefined) {
    // Pas un `Error` nu : §14. Et pas un `DomainError` non plus, pour la meme
    // raison qu `InvalidPatternListError` : un index hors liste veut dire une
    // ligne desynchronisee en base, donc une panne a regarder, pas une regle
    // metier violee par la requete.
    throw new PatternIndexOutOfRangeError(index, list.length);
  }
  return key;
}

/**
 * Lit la liste d une ligne de partie pendant la bascule expand / contract
 * (issue #52). `patterns` vaut NULL sur une ligne ecrite par l ancien code,
 * qui ne connaissait que la figure unique : on replie dessus.
 */
export function patternsDeLaLigne(patterns: string | null, pattern: string): readonly PatternKey[] {
  return parsePatternList(patterns ?? pattern);
}

/**
 * La figure en cours d une ligne de partie, ou `null` si la ligne est
 * inexploitable. Sert `list()`, qui saute une ligne corrompue plutot que
 * de faire echouer tout le tableau de bord ; `toState` leve, lui, parce
 * qu il ne rend qu une partie et que l appelant doit le savoir. C est le
 * seul endroit du module ou rattraper InvalidPatternListError et
 * PatternIndexOutOfRangeError est legitime.
 */
export function patternCouranteOuNull(
  patterns: string | null,
  pattern: string,
  index: number,
): PatternKey | null {
  try {
    return patternAt(patternsDeLaLigne(patterns, pattern), index);
  } catch (err) {
    if (err instanceof InvalidPatternListError || err instanceof PatternIndexOutOfRangeError) return null;
    throw err;
  }
}

export interface PatternProgress {
  current: PatternKey;
  /** A partir de un : ce chiffre est lu par un humain. */
  position: number;
  total: number;
}

export function patternProgress(list: readonly PatternKey[], index: number): PatternProgress {
  return { current: patternAt(list, index), position: index + 1, total: list.length };
}

export function isLastPattern(list: readonly PatternKey[], index: number): boolean {
  const { position, total } = patternProgress(list, index);
  return position === total;
}
