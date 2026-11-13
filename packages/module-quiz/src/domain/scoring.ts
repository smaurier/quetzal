import type { SessionMode } from './session-mode.js';

/**
 * Spec § 5.3 : la valeur absolue de `BASE` est sans importance, seul compte le
 * rapport `BONUS_MAX / BASE`. 1000 rend les bonus lisibles à l'unité.
 */
export const BASE = 1000;

/**
 * ⛔ Exactement `BASE / 4`, et c'est la propriété 2 de D7 : le bonus est
 * plafonné bien en dessous de `BASE`, donc une réponse juste et lente bat
 * toujours une réponse fausse et rapide. Augmenter ce rapport ferait du quiz un
 * jeu de réflexe.
 */
export const BONUS_MAX = BASE / 4;

/**
 * Marge de grâce (spec § 8 point 1) : une sélection ou une frappe déjà engagée
 * au moment de la fermeture se valide encore.
 *
 * 500 ms, et le nombre a deux bornes. Il doit **dépasser** la latence de
 * diffusion mesurée à soixante téléphones, 215 ms de médiane, issue #32, pour
 * qu'un élève ne paie pas le réseau ; et rester **petit** devant le délai le
 * plus court autorisé, trois secondes (spec § 3.3), sinon ce n'est plus une
 * marge mais une rallonge.
 *
 * ⚠️ Il couvre la médiane, pas le p95 du chemin de réponse, qui n'est pas
 * mesuré. C'est une atténuation partielle de la cartouche du dissident sur D5,
 * pas sa résolution.
 */
export const GRACE_MS = 500;

export interface FenetreDeQuestion {
  readonly mode: SessionMode;
  /** Millisecondes depuis l'époque, ou toute base commune avec `arriveeMs`. */
  readonly openedAt: number;
  /** `null` en mode contrôle, qui n'a aucun minuteur (D6). */
  readonly deadlineAt: number | null;
}

export interface ReponseChronometree {
  readonly isCorrect: boolean;
  readonly arriveeMs: number;
}

/**
 * Combien vaut cette réponse. Pure : aucune base, aucune horloge, l'instant
 * d'arrivée est une donnée d'entrée, mesurée côté serveur (D5).
 */
export function pointsPour(
  fenetre: FenetreDeQuestion,
  reponse: ReponseChronometree): number {
  if (!reponse.isCorrect) return 0;

  // D6 : le mode contrôle n'a pas de minuteur, donc le temps n'entre dans aucun
  // calcul. Il est tout de même enregistré ailleurs, pour le retour de séance.
  if (fenetre.mode === 'controle' || fenetre.deadlineAt === null) return 1;

  const duree = fenetre.deadlineAt - fenetre.openedAt;
  // Une fenêtre dégénérée ne doit pas diviser par zéro : le reste vaut alors
  // zéro, donc BASE sans bonus. Refuser serait pire, la question deviendrait
  // injouable en pleine séance.
  if (duree <= 0) return BASE;

  const restant = fenetre.deadlineAt - reponse.arriveeMs;
  // `max(0, …)` porte à la fois la grâce et le retard : au-delà de l'échéance
  // le reste est négatif, donc aucun bonus. C'est la propriété 3 de D7, et elle
  // tombe de la formule plutôt que d'un cas particulier à maintenir.
  const reste = Math.max(0, restant / duree);

  return BASE + Math.round(BONUS_MAX * Math.min(1, reste));
}
