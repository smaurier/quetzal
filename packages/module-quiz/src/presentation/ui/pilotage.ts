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

/** Au-delà, Elda voit l'erreur et ferme à la main. */
export const ESSAIS_DE_FERMETURE_MAX = 3;

export interface SuiviDesFermetures {
  /** Requête partie, aboutie, ou question déjà fermée : rien à retenter. */
  demandees: ReadonlySet<string>;
  essais: ReadonlyMap<string, number>;
}

export const SUIVI_VIDE: SuiviDesFermetures = { demandees: new Set(), essais: new Map() };

export type IssueDeFermeture = 'fermee' | 'deja-fermee' | 'echec';

export function doitFermerAZero(input: {
  sessionQuestionId: string;
  questionOuverteId: string | null;
  suivi: SuiviDesFermetures;
  commandeEnCours: boolean;
}): boolean {
  const { sessionQuestionId, questionOuverteId, suivi, commandeEnCours } = input;
  return (
    !commandeEnCours
    && questionOuverteId === sessionQuestionId
    && !suivi.demandees.has(sessionQuestionId)
    && (suivi.essais.get(sessionQuestionId) ?? 0) < ESSAIS_DE_FERMETURE_MAX
  );
}

export function fermetureDemandee(suivi: SuiviDesFermetures, sessionQuestionId: string): SuiviDesFermetures {
  return {
    demandees: new Set([...suivi.demandees, sessionQuestionId]),
    essais: new Map([...suivi.essais, [sessionQuestionId, (suivi.essais.get(sessionQuestionId) ?? 0) + 1]]),
  };
}

export function apresFermeture(
  suivi: SuiviDesFermetures,
  sessionQuestionId: string,
  issue: IssueDeFermeture): SuiviDesFermetures {
  if (issue !== 'echec') return suivi;
  return {
    demandees: new Set([...suivi.demandees].filter((id) => id !== sessionQuestionId)),
    essais: suivi.essais,
  };
}

export function issueDeFermeture(ok: boolean, cle: CleErreur | null): IssueDeFermeture {
  if (ok) return 'fermee';
  return cle === 'errorNoQuestionOpen' ? 'deja-fermee' : 'echec';
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
