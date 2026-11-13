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
  const fin = finEffective(fenetre);
  if (fin === null) return { kind: 'a-temps' };

  if (arriveeMs <= fin.instant) return { kind: 'a-temps' };
  // §8 point 1 : la grace motrice part de « la fermeture », manuelle ou
  // echue. D8 fait fermer le navigateur de l'animatrice a zero : sans grace
  // apres `closedAt`, elle ne s'appliquerait jamais.
  if (arriveeMs <= fin.instant + GRACE_MS) return { kind: 'dans-la-grace' };
  return { kind: 'trop-tard', raison: fin.raison };
}

interface FinEffective {
  readonly instant: number;
  readonly raison: 'echeance-depassee' | 'question-fermee';
}

function finEffective({ deadlineAt, closedAt }: FenetreOuverte): FinEffective | null {
  if (closedAt !== null && (deadlineAt === null || closedAt <= deadlineAt)) {
    return { instant: closedAt, raison: 'question-fermee' };
  }
  if (deadlineAt !== null) return { instant: deadlineAt, raison: 'echeance-depassee' };
  return null;
}
