/**
 * Le domaine ne connaît aucune langue. Il rend de quoi fabriquer le libellé,
 * l écran applique la traduction. Spec section 6.1.
 */
export type TeamName =
  | { kind: 'member'; displayName: string }
  | { kind: 'numbered'; number: number };

export function teamNameFor(input: {
  memberDisplayNames: readonly string[];
  teamIndex: number;
}): TeamName {
  const [only] = input.memberDisplayNames;
  if (input.memberDisplayNames.length === 1 && only !== undefined) {
    return { kind: 'member', displayName: only };
  }
  return { kind: 'numbered', number: input.teamIndex + 1 };
}
