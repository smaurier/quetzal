import { PATTERN_KEYS, isPatternKey, type PatternKey } from './pattern.js';

/** Quatre figures existent : une liste n en contient ni zero ni plus. */
const MAX = PATTERN_KEYS.length;

/**
 * La base stocke une chaine (`CLAUDE.md` :9 : pas d enum Postgres, et un
 * tableau Postgres serait disproportionne pour quatre cles courtes). Le port
 * expose un tableau : la traduction vit ici, et nulle part ailleurs.
 */
export function parsePatternList(raw: string): PatternKey[] {
  const keys = raw.split(',').map((key) => key.trim());
  const list = keys.filter(isPatternKey);
  if (list.length !== keys.length || !isValidPatternList(list)) {
    throw new Error(`liste de figures invalide : ${JSON.stringify(raw)}`);
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
