/**
 * Le domaine ne connaît aucune langue. Il rend de quoi fabriquer le libellé,
 * l écran applique la traduction. Spec section 6.1.
 */
export type TeamName =
  | { kind: 'member'; displayName: string }
  | { kind: 'numbered'; number: number }
  /**
   * Un nom choisi par l animatrice (issue #29). `label` n est PAS une clé de
   * traduction : c est un texte tapé par un humain, et l écran l affiche tel
   * quel. C est tout l objet de cette troisième variante — sans elle, un
   * libellé choisi serait indiscernable d une clé.
   */
  | { kind: 'custom'; label: string };

export function teamNameFor(input: {
  memberDisplayNames: readonly string[];
  teamIndex: number;
  /** Issue #29. Absent ou blanc : on retombe sur le nom dérivé. */
  chosenName?: string | null;
}): TeamName {
  // Un nom blanc vaut absence de nom, et c est ainsi qu on ANNULE un
  // renommage : l animatrice vide le champ, l équipe retrouve son nom dérivé.
  const choisi = input.chosenName?.trim();
  if (choisi !== undefined && choisi !== '') return { kind: 'custom', label: choisi };

  const [only] = input.memberDisplayNames;
  if (input.memberDisplayNames.length === 1 && only !== undefined) {
    return { kind: 'member', displayName: only };
  }
  return { kind: 'numbered', number: input.teamIndex + 1 };
}
