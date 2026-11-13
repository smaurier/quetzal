import type { SessionMode } from './session-mode.js';

/** Bornes de la spec § 3.3, en secondes. */
export const TIME_LIMIT_MIN = 3;
export const TIME_LIMIT_MAX = 120;

export interface DemandeDeDelai {
  readonly mode: SessionMode;
  /** Valeur de **rédaction** portée par la question éditable. */
  readonly questionTimeLimit: number | null;
  /** Défaut de la session, valeur de **rédaction** elle aussi (D10). */
  readonly sessionDefault: number | null;
}

export type DelaiResolu =
  | { kind: 'resolu'; seconds: number | null }
  | { kind: 'refuse'; raison: 'aucun-delai' | 'hors-bornes' };

/**
 * Le délai qui fera foi pour une question, résolu **une seule fois**, au
 * figement (D10). La valeur rendue part sur la ligne figée
 * (`Quiz_SessionQuestion.timeLimitResolved`) et plus rien ne la relit ailleurs.
 *
 * ⛔ Refaire cette résolution à chaque lecture ferait qu'une correction de la
 * question en pleine séance changerait le sens des réponses déjà données.
 */
export function resoudreLeDelai(demande: DemandeDeDelai): DelaiResolu {
  // D6 : aucun minuteur en mode contrôle. Ce n'est pas un refus mais une
  // absence de limite, et c'est précisément ce qui fait que WCAG 2.2.1 ne
  // s'applique pas à ce mode (spec § 8).
  if (demande.mode === 'controle') return { kind: 'resolu', seconds: null };

  const choisi = demande.questionTimeLimit ?? demande.sessionDefault;
  // Un refus, et non un repli sur une valeur inventée : une séance de défi dont
  // une question n'a aucun délai est injouable, et le découvrir devant la classe
  // est le pire moment possible.
  if (choisi === null) return { kind: 'refuse', raison: 'aucun-delai' };

  if (choisi < TIME_LIMIT_MIN || choisi > TIME_LIMIT_MAX) {
    return { kind: 'refuse', raison: 'hors-bornes' };
  }
  return { kind: 'resolu', seconds: choisi };
}
