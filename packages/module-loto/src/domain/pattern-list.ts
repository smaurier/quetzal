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
    // Pas un `Error` nu : §14. Et pas un `DomainError` non plus, pour la même
    // raison qu `InvalidPatternListError` : un index hors liste veut dire une
    // ligne desynchronisee en base, donc une panne a regarder, pas une regle
    // metier violee par la requete.
    throw new PatternIndexOutOfRangeError(index, list.length);
  }
  return key;
}

export function isLastPattern(list: readonly PatternKey[], index: number): boolean {
  return index >= list.length - 1;
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
