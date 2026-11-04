import { PATTERN_KEYS, isPatternKey, type PatternKey } from './pattern.js';
import { InvalidPatternListError } from './errors.js';

const MAX = PATTERN_KEYS.length;

/**
 * La base stocke une chaine (`CLAUDE.md` §9 : pas d enum Postgres, et un
 * tableau Postgres serait disproportionne pour quatre cles courtes). Le port
 * expose un tableau : la traduction vit ici, et nulle part ailleurs.
 */
export function parsePatternList(raw: string): PatternKey[] {
  const keys = raw.split(',').map((key) => key.trim());
  
  // Vérifier liste vide
  if (keys.every((k) => k === '')) {
    throw new InvalidPatternListError(raw, 'liste vide');
  }
  
  // Vérifier séparateurs dégénérés
  if (keys.some((k) => k === '')) {
    throw new InvalidPatternListError(raw, 'separateur degenere');
  }
  
  const list = keys.filter(isPatternKey);
  
  // Vérifier clé inconnue
  if (list.length !== keys.length) {
    throw new InvalidPatternListError(raw, 'cle inconnue');
  }
  
  // Vérifier validité (doublon, longueur, etc.)
  if (!isValidPatternList(list)) {
    throw new InvalidPatternListError(raw, 'doublon');
  }
  
  return list;
}

export function serializePatternList(list: readonly PatternKey[]): string {
  return list.join(',');
}

export function isValidPatternList(list: readonly string[]): boolean {
  if (list.length === 0 || list.length > MAX) return false;
  if (new Set(list).size !== list.length) return false;
  return list.every(isPatternKey);
}
