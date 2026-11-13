import type { FermetureVue, SessionVue } from './quiz-socket-state.js';

export type ActionPrincipale = 'open' | 'start' | 'next' | 'close';

interface QuestionOuverte {
  sessionQuestionId: string;
  rank: number;
}

export function actionPrincipale(
  session: SessionVue,
  question: QuestionOuverte | null,
  closed: FermetureVue | null): ActionPrincipale | null {
  switch (session.status) {
    case 'brouillon':
      return 'open';
    case 'ouverte':
      return 'start';
    case 'terminee':
      return null;
    case 'en-cours':
      if (question !== null) return 'close';
      return toutesJouees(session, closed) ? null : 'next';
  }
}

export interface EtatAffiche {
  cle:
    | 'statusDraft'
    | 'statusOpen'
    | 'statusStarted'
    | 'statusQuestionOpen'
    | 'statusQuestionClosed'
    | 'statusAllPlayed'
    | 'statusFinished';
  valeurs: Record<string, number>;
}

export function etatDeSeance(
  session: SessionVue,
  question: QuestionOuverte | null,
  closed: FermetureVue | null): EtatAffiche {
  const total = session.questionCount;
  switch (session.status) {
    case 'brouillon':
      return { cle: 'statusDraft', valeurs: {} };
    case 'ouverte':
      return { cle: 'statusOpen', valeurs: {} };
    case 'terminee':
      return { cle: 'statusFinished', valeurs: {} };
    case 'en-cours':
      if (question !== null) return { cle: 'statusQuestionOpen', valeurs: { rank: question.rank, total } };
      if (closed === null) return { cle: 'statusStarted', valeurs: {} };
      if (toutesJouees(session, closed)) return { cle: 'statusAllPlayed', valeurs: { total } };
      return { cle: 'statusQuestionClosed', valeurs: { rank: closed.rank, total } };
  }
}

/** Les questions s'ouvrent par rang croissant : fermer la dernière, c'est avoir tout joué. */
function toutesJouees(session: SessionVue, closed: FermetureVue | null): boolean {
  return closed !== null && closed.rank >= session.questionCount;
}

export function doitFermerAZero(input: {
  sessionQuestionId: string;
  dejaDemandees: ReadonlySet<string>;
  commandeEnCours: boolean;
}): boolean {
  return !input.commandeEnCours && !input.dejaDemandees.has(input.sessionQuestionId);
}

export type CleErreur =
  | 'errorNoQuestionLeft'
  | 'errorNoQuestionOpen'
  | 'errorEmptyBank'
  | 'errorBankDeleted'
  | 'errorTransition'
  | 'errorTimeLimit'
  | 'errorNotFound'
  | 'errorGeneric';

/** Les codes de `session-errors.filter.ts`. */
const PAR_CODE: ReadonlyMap<string, CleErreur> = new Map<string, CleErreur>([
  ['no_question_left', 'errorNoQuestionLeft'],
  ['no_question_open', 'errorNoQuestionOpen'],
  ['empty_bank', 'errorEmptyBank'],
  ['session_bank_deleted', 'errorBankDeleted'],
  ['invalid_session_transition', 'errorTransition'],
  ['time_limit_unresolvable', 'errorTimeLimit'],
]);

export function cleErreurDeCommande(statut: number, corps: unknown): CleErreur {
  if (statut === 404) return 'errorNotFound';
  if (typeof corps !== 'object' || corps === null || !('error' in corps)) return 'errorGeneric';
  const code = corps.error;
  if (typeof code !== 'string') return 'errorGeneric';
  return PAR_CODE.get(code) ?? 'errorGeneric';
}

/** La raison d'un `join-failed` : le NOM d'une classe d'erreur (passerelle). */
export function cleErreurDeSalle(raison: string): CleErreur {
  return raison === 'SessionNotFoundError' ? 'errorNotFound' : 'errorGeneric';
}
