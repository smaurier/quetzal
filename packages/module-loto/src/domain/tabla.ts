import { DeckTooSmallError } from './errors.js';
import { TABLA_SIZE, type Grid } from './pattern.js';

export const MIN_DECK_SIZE = TABLA_SIZE;

/**
 * Tire seize cartes sans remise. Le générateur est injecté pour rendre les tests
 * déterministes : aucun appel direct à Math.random dans le domaine.
 */
export function generateTabla(deckCardIds: readonly string[], random: () => number): string[] {
  if (deckCardIds.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deckCardIds.length);

  const pool = [...deckCardIds];
  const picked: string[] = [];
  while (picked.length < TABLA_SIZE) {
    const index = Math.floor(random() * pool.length) % pool.length;
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}

/**
 * Projette une tabla en grille de booléens à partir des cartes réellement tirées.
 * C est la seule entrée légitime d une validation de réclamation : jamais les
 * marquages du client.
 */
export function projectTabla(tablaCardIds: readonly string[], drawnCardIds: ReadonlySet<string>): Grid {
  return tablaCardIds.map((id) => drawnCardIds.has(id));
}
