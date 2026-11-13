import { GRACE_MS } from './scoring.js';

export interface FenetreOuverte {
  /** `null` en mode contrôle : rien n'expire (D6). */
  readonly deadlineAt: number | null;
  /** Non nul dès que l'animatrice a fermé la question à la main. */
  readonly closedAt: number | null;
}

export type AccueilDeReponse =
  | { kind: 'a-temps' }
  | { kind: 'dans-la-grace' }
  | { kind: 'trop-tard'; raison: 'echeance-depassee' | 'question-fermee' };

/**
 * Cette réponse est-elle recevable ? D8 : évaluation **paresseuse**, sans aucun
 * minuteur serveur et sans `setTimeout`.
 *
 * ⛔ C'est ce qui rend la fermeture juste même après une mise en veille de
 * l'instance Render : au réveil, l'échéance est déjà dans le passé et la
 * question est fermée. Un réveil programmé, lui, aurait pu être manqué et
 * laisser une question ouverte pour toujours.
 */
export function accueilDeLaReponse(
  fenetre: FenetreOuverte,
  arriveeMs: number): AccueilDeReponse {
  // Le geste de l'animatrice passe AVANT l'échéance : sans ça, « on passe à la
  // suite » n'aurait aucun effet tant que le délai n'est pas écoulé.
  if (fenetre.closedAt !== null) return { kind: 'trop-tard', raison: 'question-fermee' };

  // Mode contrôle : rien n'expire, et surtout pas de grâce, il n'y a rien dont
  // elle serait la marge.
  if (fenetre.deadlineAt === null) return { kind: 'a-temps' };

  if (arriveeMs <= fenetre.deadlineAt) return { kind: 'a-temps' };
  if (arriveeMs <= fenetre.deadlineAt + GRACE_MS) return { kind: 'dans-la-grace' };
  return { kind: 'trop-tard', raison: 'echeance-depassee' };
}
