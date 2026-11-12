export interface ReglesDeSaisie {
  readonly accentsSensibles: boolean;
  readonly casseSensible: boolean;
}

/**
 * ⛔ `ñ` n'est PAS un `n` accentué : c'est une lettre de l'alphabet espagnol.
 * La décomposition Unicode la sépare pourtant en `n` + tilde combinant, donc on
 * décompose grapheme par grapheme et on laisse `ñ` intact. Sans ça, `ano`
 * serait accepté pour `año`, ce qui n'est pas une tolérance mais une faute de
 * sens.
 *
 * Pas de sentinelle : un caractère de remplacement invisible rend le fichier
 * illisible et peut apparaître dans la saisie d'un élève.
 */
const LETTRES_INTACTES = new Set(['ñ', 'Ñ']);

function sansAccents(valeur: string): string {
  return [...valeur]
    .map((lettre) =>
      LETTRES_INTACTES.has(lettre)
        ? lettre
        : lettre.normalize('NFD').replace(/\p{Diacritic}/gu, '').normalize('NFC'))
    .join('');
}

export function normaliser(valeur: string, regles: ReglesDeSaisie): string {
  let resultat = valeur.trim().replace(/\s+/g, ' ');
  if (!regles.accentsSensibles) resultat = sansAccents(resultat);
  if (!regles.casseSensible) resultat = resultat.toLocaleLowerCase('es');
  return resultat;
}
