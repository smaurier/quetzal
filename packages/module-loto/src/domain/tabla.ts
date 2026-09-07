import { DeckTooSmallError, TablaGenerationExhaustedError } from './errors.js';
import { TABLA_SIZE, type Grid } from './pattern.js';

export const MIN_DECK_SIZE = TABLA_SIZE;

/**
 * Nombre de retirages tentés avant d'abandonner. Pur garde-fou : à 54 cartes comme
 * à 16 (le plancher), le nombre de séquences possibles rend une collision réelle
 * quasi impossible pour les quelques équipes d'une partie (voir tabla.spec.ts).
 */
export const MAX_TABLA_GENERATION_ATTEMPTS = 100;

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
 * Compare deux tablas terme à terme, dans l'ordre. Pas de concaténation avec
 * séparateur : un identifiant de carte n'a aucun format garanti (dépend du jeu
 * fourni par le tenant), un séparateur pourrait donc s'y trouver et fausser la
 * comparaison ; la comparaison élément par élément est sûre quel que soit le format.
 */
function isSameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Tire une tabla qui ne reproduit, en SÉQUENCE, aucune tabla déjà distribuée dans
 * la partie. L'unicité porte sur l'ordre, pas sur l'ensemble des cartes : avec un
 * jeu de seize cartes exactement, generateTabla rend toujours les seize mêmes
 * cartes (voir plus haut), donc toute comparaison par ensemble collisionnerait à
 * chaque tentative et bouclerait indéfiniment. Spec §5.1.
 */
export function generateUniqueTabla(
  deckCardIds: readonly string[],
  existingTablas: readonly (readonly string[])[],
  random: () => number,
): string[] {
  for (let attempt = 0; attempt < MAX_TABLA_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateTabla(deckCardIds, random);
    if (!existingTablas.some((existing) => isSameSequence(existing, candidate))) {
      return candidate;
    }
  }
  throw new TablaGenerationExhaustedError(existingTablas.length, MAX_TABLA_GENERATION_ATTEMPTS);
}

/**
 * Projette une tabla en grille de booléens à partir des cartes réellement tirées.
 * C est la seule entrée légitime d une validation de réclamation : jamais les
 * marquages du client.
 */
export function projectTabla(tablaCardIds: readonly string[], drawnCardIds: ReadonlySet<string>): Grid {
  return tablaCardIds.map((id) => drawnCardIds.has(id));
}
