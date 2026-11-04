import { isPatternKey, type PatternKey } from './pattern.js';
import { InvalidPatternListError } from './errors.js';

/**
 * La base stocke une chaine (`CLAUDE.md` §9 : pas d enum Postgres, et un
 * tableau Postgres serait disproportionne pour quatre cles courtes). Le port
 * expose un tableau : la traduction vit ici, et nulle part ailleurs.
 */
export function parsePatternList(raw: string): PatternKey[] {
  const keys = raw.split(',').map((key) => key.trim());
  
  if (keys.every((k) => k === '')) {
    throw new InvalidPatternListError(raw, 'liste vide');
  }
  
  if (keys.some((k) => k === '')) {
    throw new InvalidPatternListError(raw, 'separateur degenere');
  }
  
  if (!isValidPatternList(keys)) {
    if (new Set(keys).size !== keys.length) {
      throw new InvalidPatternListError(raw, 'doublon');
    }
    throw new InvalidPatternListError(raw, 'cle inconnue');
  }
  
  return keys;
}

export function serializePatternList(list: readonly PatternKey[]): string {
  if (!isValidPatternList(list)) {
    const serialized = list.join(',');
    if (list.length === 0) {
      throw new InvalidPatternListError(serialized, 'liste vide');
    }
    throw new InvalidPatternListError(serialized, 'doublon');
  }
  return list.join(',');
}

export function isValidPatternList(list: readonly string[]): list is PatternKey[] {
  if (list.length === 0) return false;
  if (new Set(list).size !== list.length) return false;
  return list.every(isPatternKey);
}
