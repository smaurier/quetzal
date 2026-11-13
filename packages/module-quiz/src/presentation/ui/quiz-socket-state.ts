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
      payload: { session: SessionVue; participantId: string | null; question: QuestionVue | null };
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
 * ⛔ D8 : ce zéro déclenche la fermeture. À l'ouverture, il se compte depuis
 * la RÉCEPTION de `question-opened`, qui suit l'écriture en base : il ne tombe
 * donc jamais avant l'échéance du serveur, quelle que soit l'horloge locale.
 * À une reprise (reconnexion en pleine question), la réception ne dit plus
 * rien de l'ouverture : seule `deadlineAt` reste, bornée à [réception,
 * réception + délai] pour qu'une horloge très décalée ne donne ni un zéro
 * passé ni un délai plus long que celui de la question.
 */
export function echeanceLocale(
  question: QuestionVue,
  recuA: number,
  origine: 'ouverture' | 'reprise'): number | null {
  if (question.deadlineAt === null || question.timeLimitResolved === null) return null;
  const auPlusTard = recuA + question.timeLimitResolved * 1000;
  if (origine === 'ouverture') return auPlusTard;
  return Math.min(auPlusTard, Math.max(recuA, Date.parse(question.deadlineAt)));
}

export function reduireQuiz(etat: EtatQuiz, evenement: EvenementQuiz): EtatQuiz {
  switch (evenement.type) {
    case 'state': {
      const { session, participantId, question } = evenement.payload;
      return {
        ...etat,
        session,
        participantId,
        question: question === null ? null : enCours(question, evenement.recuA, 'reprise'),
        closed: question === null ? etat.closed : null,
        error: null,
      };
    }
    case 'session-changed':
      return { ...etat, session: evenement.payload };
    case 'question-opened':
      return {
        ...etat,
        question: enCours(evenement.payload, evenement.recuA, 'ouverture'),
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

function enCours(question: QuestionVue, recuA: number, origine: 'ouverture' | 'reprise'): QuestionEnCours {
  return { ...question, echeanceMs: echeanceLocale(question, recuA, origine) };
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
