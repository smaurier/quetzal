/**
 * Type brand (D1) : un identifiant de carte n est un DrawnCardId que s il a
 * transité par drawnCardIds(), donc par le tirage réel du serveur (Loto_Draw).
 * Un ClaimInput.drawnCardIds ne peut alors plus être construit à partir d un
 * marquage client sans erreur de compilation.
 */
export type DrawnCardId = string & { readonly __brand: 'DrawnCardId' };

/**
 * Seule fabrique légitime de DrawnCardId. `fromServerDraws` doit venir du
 * tirage enregistré côté serveur, jamais d un payload client.
 */
export function drawnCardIds(fromServerDraws: readonly string[]): ReadonlySet<DrawnCardId> {
  // Seul cast `as` du module (CLAUDE.md §8) : ce point est le seul endroit
  // autorisé à affirmer la provenance serveur qu aucun typeguard ne peut vérifier.
  return new Set(fromServerDraws as readonly DrawnCardId[]);
}
