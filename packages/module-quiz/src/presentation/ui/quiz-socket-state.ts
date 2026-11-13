import type { AnswerMode } from '../../domain/answer-mode.js';
import type { SessionMode } from '../../domain/session-mode.js';
import type { SessionStatus } from '../../domain/session-status.js';

/** La forme de `questionPourLaSalle` : sans `isCorrect`, ni réponses acceptées. */
export interface QuestionVue {
  sessionQuestionId: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: AnswerMode;
  timeLimitResolved: number | null;
  deadlineAt: string | null;
  options: readonly {
    id: string;
    rank: number;
    label: string | null;
    imageId: string | null;
    imageAlt: string | null;
  }[];
}

export interface QuestionEnCours extends QuestionVue {
  /** Instant local du zéro, `null` en mode contrôle. Voir `echeanceLocale`. */
  echeanceMs: number | null;
}

export interface ParticipantVue {
  id: string;
  participantIndex: number;
  name: string | null;
  /** Masqué pendant une question ouverte : le score d'avant elle (diffuseur). */
  score: number;
  memberNames: readonly string[];
}

/** La forme de `etatPourLaSalle`. */
export interface SessionVue {
  id: string;
  status: SessionStatus;
  mode: SessionMode;
  joinCode: string;
  questionCount: number;
  participants: readonly ParticipantVue[];
}

export interface FermetureVue {
  sessionQuestionId: string;
  rank: number;
  answerCount: number;
  correctCount: number;
}

export interface FinVue {
  questionCount: number;
  classement: readonly { participantId: string; label: string; score: number }[];
}

export interface ResultatReponse {
  isCorrect: boolean;
  points: number;
  dansLaGrace: boolean;
}

export interface EtatQuiz {
  session: SessionVue | null;
  participantId: string | null;
  question: QuestionEnCours | null;
  closed: FermetureVue | null;
  result: ResultatReponse | null;
  refusal: string | null;
  finished: FinVue | null;
  error: string | null;
}

export const ETAT_INITIAL: EtatQuiz = {
  session: null,
  participantId: null,
  question: null,
  closed: null,
  result: null,
  refusal: null,
  finished: null,
  error: null,
};

export type EvenementQuiz =
  | {
      type: 'state';
      payload: {
        session: SessionVue;
        participantId: string | null;
        question: QuestionVue | null;
        /** Mesuré par le serveur à SON horloge, `null` sans échéance. */
        restantMs: number | null;
      };
      recuA: number;
    }
  | { type: 'session-changed'; payload: SessionVue }
  | { type: 'question-opened'; payload: QuestionVue; recuA: number }
  | { type: 'question-closed'; payload: { sessionQuestionId: string; answerCount: number; correctCount: number } }
  | { type: 'session-finished'; payload: FinVue }
  | { type: 'answer-result'; payload: ResultatReponse }
  | { type: 'answer-refused'; payload: { reason: string } }
  | { type: 'join-failed'; payload: { reason: string } };

/**
 * ⛔ D8 : ce zéro déclenche la fermeture. Il ne se calcule QUE depuis des
 * durées, jamais depuis `deadlineAt` : c'est un instant de l'horloge du
 * serveur, et le comparer à `Date.now()` fermerait trop tôt la question d'un
 * navigateur dont l'horloge avance. À l'ouverture, la durée est le délai
 * entier (la réception suit l'écriture en base, donc ce zéro ne tombe jamais
 * avant l'échéance) ; à une reprise, c'est le temps restant mesuré par le
 * serveur.
 */
export function echeanceLocale(recuA: number, restantMs: number | null): number | null {
  return restantMs === null ? null : recuA + restantMs;
}

export function reduireQuiz(etat: EtatQuiz, evenement: EvenementQuiz): EtatQuiz {
  switch (evenement.type) {
    case 'state': {
      const { session, participantId, question } = evenement.payload;
      return {
        ...etat,
        session,
        participantId,
        question: question === null ? null : enCours(question, echeanceLocale(evenement.recuA, evenement.payload.restantMs)),
        closed: question === null ? etat.closed : null,
        error: null,
      };
    }
    case 'session-changed':
      return { ...etat, session: evenement.payload };
    case 'question-opened':
      return {
        ...etat,
        question: enCours(evenement.payload, echeanceLocale(evenement.recuA, delaiEntierMs(evenement.payload))),
        closed: null,
        result: null,
        refusal: null,
      };
    case 'question-closed':
      return fermer(etat, evenement.payload);
    case 'session-finished':
      return {
        ...etat,
        session: etat.session === null ? null : { ...etat.session, status: 'terminee' },
        question: null,
        finished: evenement.payload,
      };
    case 'answer-result':
      return { ...etat, result: evenement.payload, refusal: null };
    case 'answer-refused':
      return { ...etat, refusal: evenement.payload.reason };
    case 'join-failed':
      return { ...etat, error: evenement.payload.reason };
  }
}

function delaiEntierMs(question: QuestionVue): number | null {
  return question.timeLimitResolved === null ? null : question.timeLimitResolved * 1000;
}

function enCours(question: QuestionVue, echeanceMs: number | null): QuestionEnCours {
  return { ...question, echeanceMs };
}

/**
 * Une réponse de grâce rediffuse la fermeture de N (tâche 12) : elle met à
 * jour les comptes de N si N est la dernière fermée, et ne touche à rien si
 * N+1 est déjà ouverte.
 */
function fermer(
  etat: EtatQuiz,
  payload: { sessionQuestionId: string; answerCount: number; correctCount: number }): EtatQuiz {
  const { sessionQuestionId, answerCount, correctCount } = payload;
  if (etat.question?.sessionQuestionId === sessionQuestionId) {
    return { ...etat, question: null, closed: { sessionQuestionId, rank: etat.question.rank, answerCount, correctCount } };
  }
  if (etat.question === null && etat.closed?.sessionQuestionId === sessionQuestionId) {
    return { ...etat, closed: { ...etat.closed, answerCount, correctCount } };
  }
  return etat;
}
