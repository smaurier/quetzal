import type { TeamName } from '../../domain/team-name.js';

type Traduire = (key: string, values?: Record<string, string | number>) => string;

/**
 * Le libellé d'une équipe, à l'écran.
 *
 * Le domaine rend de quoi fabriquer le libellé, jamais le libellé (spec 6.1) :
 * c'est ici que la traduction s'applique. Cette fonction existait en trois
 * exemplaires — un ternaire recopié dans `animator-page`, `guest-join` et
 * `nameOf` — et l'arrivée du nom choisi (issue #29) l'a rendue visible : trois
 * endroits à ne pas oublier, et aucun compilateur pour le dire.
 *
 * ⛔ `kind: 'custom'` N'EST PAS traduit, et ce n'est pas un oubli. C'est un
 * texte tapé par l'animatrice ; le passer à `t()` chercherait une clé qui
 * n'existe pas et afficherait la chaîne brute ou une erreur selon le moteur.
 *
 * Le `switch` est exhaustif et le `default` affecte à `never` : ajouter une
 * quatrième variante à `TeamName` ne compilera pas tant que ce fichier ne la
 * traite pas. C'est la garde que les trois ternaires n'avaient pas.
 */
export function teamLabel(name: TeamName, t: Traduire): string {
  switch (name.kind) {
    case 'custom':
      return name.label;
    case 'member':
      return name.displayName;
    case 'numbered':
      return t('team.numbered', { number: name.number });
    default: {
      const jamais: never = name;
      return jamais;
    }
  }
}
