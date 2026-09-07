import { matchesPattern, type PatternKey } from './pattern.js';
import { projectTabla } from './tabla.js';
import type { DrawnCardId } from './drawn-cards.js';

export interface ClaimInput {
  tablaCardIds: readonly string[];
  /** Cartes réellement tirées par le serveur. Seule source de vérité. */
  drawnCardIds: ReadonlySet<DrawnCardId>;
  pattern: PatternKey;
}

/**
 * Décision D1 de la spec : le serveur ne lit jamais le marquage du client.
 * Cette signature n accepte volontairement aucune entrée qui en viendrait.
 * Ajouter un tel paramètre rouvrirait la triche par marquage falsifié.
 */
export function isWinningClaim(input: ClaimInput): boolean {
  return matchesPattern(projectTabla(input.tablaCardIds, input.drawnCardIds), input.pattern);
}
