import { describe, expect, it } from 'vitest';
import {
  ETAT_INITIAL,
  echeanceLocale,
  reduireQuiz,
  type EtatQuiz,
  type QuestionVue,
  type SessionVue,
} from './quiz-socket-state.js';

/**
 * L'etat d'un ecran de seance, recalcule a chaque evenement de la salle. Pur,
 * donc prouvable sans navigateur : le depot n'a ni jsdom ni testing-library,
 * et sa convention est d'extraire le calcul pour que le JSX ne soit que du
 * cablage (cf. `propositions.ts`).
 */

function session(partiel: Partial<SessionVue> = {}): SessionVue {
  return {
    id: 's1',
    status: 'en-cours',
    mode: 'defi',
    joinCode: 'ABC123',
    questionCount: 3,
    participants: [],
    ...partiel,
  };
}

function question(partiel: Partial<QuestionVue> = {}): QuestionVue {
  return {
    sessionQuestionId: 'q1',
    rank: 1,
    prompt: '¿Cómo se dice « chat » ?',
    imageId: null,
    imageAlt: null,
    answerMode: 'choix',
    timeLimitResolved: 20,
    deadlineAt: new Date(120_000).toISOString(),
    options: [],
    ...partiel,
  };
}

function apres(...evenements: Parameters<typeof reduireQuiz>[1][]): EtatQuiz {
  return evenements.reduce(reduireQuiz, ETAT_INITIAL);
}

describe('echeanceLocale', () => {
  it('ne donne aucune echeance en mode controle', () => {
    expect(echeanceLocale(question({ deadlineAt: null, timeLimitResolved: null }), 1_000, 'ouverture')).toBeNull();
  });

  /**
   * ⛔ D8 : c'est CE navigateur qui ferme la question a zero. Caler le zero sur
   * `deadlineAt` lu avec l'horloge locale fermerait trop TOT un navigateur dont
   * l'horloge avance : la question serait close avant l'echeance, et des eleves
   * perdraient leur temps de reponse. La reception de `question-opened` suit
   * l'ouverture en base, donc reception + delai ne tombe jamais avant
   * l'echeance du serveur ; un retard de livraison est sans danger, le serveur
   * borne la fermeture a `deadlineAt`.
   */
  it('a l ouverture, compte le delai depuis la reception, jamais depuis l horloge du serveur', () => {
    const horlogeEnAvance = question({ timeLimitResolved: 20, deadlineAt: new Date(5_000).toISOString() });

    expect(echeanceLocale(horlogeEnAvance, 100_000, 'ouverture')).toBe(120_000);
  });

  it('a une reprise, se cale sur l echeance du serveur', () => {
    const q = question({ timeLimitResolved: 20, deadlineAt: new Date(110_000).toISOString() });

    expect(echeanceLocale(q, 100_000, 'reprise')).toBe(110_000);
  });

  it('a une reprise, ne place jamais l echeance avant la reception', () => {
    const depassee = question({ timeLimitResolved: 20, deadlineAt: new Date(50_000).toISOString() });

    expect(echeanceLocale(depassee, 100_000, 'reprise')).toBe(100_000);
  });

  it('a une reprise, ne place jamais l echeance au-dela d un delai entier', () => {
    const horlogeEnRetard = question({ timeLimitResolved: 20, deadlineAt: new Date(900_000).toISOString() });

    expect(echeanceLocale(horlogeEnRetard, 100_000, 'reprise')).toBe(120_000);
  });
});

describe('reduireQuiz', () => {
  it('prend l etat complet envoye a chaque connexion', () => {
    const etat = apres({
      type: 'state',
      payload: { session: session(), participantId: null, question: question() },
      recuA: 100_000,
    });

    expect(etat.session?.joinCode).toBe('ABC123');
    expect(etat.question?.sessionQuestionId).toBe('q1');
    expect(etat.question?.echeanceMs).toBe(120_000);
  });

  it('remplace la seance a chaque session-changed, sans toucher la question ouverte', () => {
    const etat = apres(
      { type: 'state', payload: { session: session(), participantId: null, question: question() }, recuA: 100_000 },
      { type: 'session-changed', payload: session({ participants: [{ id: 'p1', participantIndex: 1, name: null, score: 1200, memberNames: ['Ana'] }] }) });

    expect(etat.session?.participants[0]?.score).toBe(1200);
    expect(etat.question?.sessionQuestionId).toBe('q1');
  });

  it('accepte une seance avant l etat complet', () => {
    expect(apres({ type: 'session-changed', payload: session() }).session?.id).toBe('s1');
  });

  it('ouvre une question, et efface la correction et la reponse de la precedente', () => {
    const etat = apres(
      { type: 'state', payload: { session: session(), participantId: 'p1', question: question() }, recuA: 0 },
      { type: 'answer-result', payload: { isCorrect: true, points: 1100, dansLaGrace: false } },
      { type: 'question-closed', payload: { sessionQuestionId: 'q1', answerCount: 2, correctCount: 1 } },
      { type: 'question-opened', payload: question({ sessionQuestionId: 'q2', rank: 2 }), recuA: 200_000 });

    expect(etat.question?.sessionQuestionId).toBe('q2');
    expect(etat.question?.echeanceMs).toBe(220_000);
    expect(etat.closed).toBeNull();
    expect(etat.result).toBeNull();
  });

  it('ferme la question ouverte et garde son rang avec les comptes', () => {
    const etat = apres(
      { type: 'question-opened', payload: question({ sessionQuestionId: 'q2', rank: 2 }), recuA: 0 },
      { type: 'question-closed', payload: { sessionQuestionId: 'q2', answerCount: 3, correctCount: 2 } });

    expect(etat.question).toBeNull();
    expect(etat.closed).toEqual({ sessionQuestionId: 'q2', rank: 2, answerCount: 3, correctCount: 2 });
  });

  /**
   * ⛔ Une reponse de grace fait rediffuser `question-closed` de N jusqu'a
   * 500 ms apres la fermeture. Si l'animatrice a deja ouvert N+1, cette
   * rediffusion ne doit pas fermer N+1 a l'ecran.
   */
  it('ignore la fermeture tardive d une question qui n est plus la courante', () => {
    const etat = apres(
      { type: 'question-opened', payload: question({ sessionQuestionId: 'q1', rank: 1 }), recuA: 0 },
      { type: 'question-closed', payload: { sessionQuestionId: 'q1', answerCount: 1, correctCount: 1 } },
      { type: 'question-opened', payload: question({ sessionQuestionId: 'q2', rank: 2 }), recuA: 0 },
      { type: 'question-closed', payload: { sessionQuestionId: 'q1', answerCount: 2, correctCount: 1 } });

    expect(etat.question?.sessionQuestionId).toBe('q2');
    expect(etat.closed).toBeNull();
  });

  it('met a jour les comptes quand une reponse de grace rediffuse la fermeture', () => {
    const etat = apres(
      { type: 'question-opened', payload: question({ sessionQuestionId: 'q1', rank: 1 }), recuA: 0 },
      { type: 'question-closed', payload: { sessionQuestionId: 'q1', answerCount: 1, correctCount: 1 } },
      { type: 'question-closed', payload: { sessionQuestionId: 'q1', answerCount: 2, correctCount: 2 } });

    expect(etat.closed).toEqual({ sessionQuestionId: 'q1', rank: 1, answerCount: 2, correctCount: 2 });
  });

  /** `session-finished` ne porte que le podium : aucun `session-changed` ne le suit. */
  it('termine la seance a la reception du podium', () => {
    const etat = apres(
      { type: 'state', payload: { session: session(), participantId: null, question: question() }, recuA: 0 },
      { type: 'session-finished', payload: { questionCount: 3, classement: [{ participantId: 'p1', label: 'Ana', score: 2100 }] } });

    expect(etat.session?.status).toBe('terminee');
    expect(etat.question).toBeNull();
    expect(etat.finished?.classement[0]?.label).toBe('Ana');
  });

  it('garde le resultat et le refus d une reponse', () => {
    expect(apres({ type: 'answer-result', payload: { isCorrect: false, points: 0, dansLaGrace: false } }).result?.isCorrect).toBe(false);
    expect(apres({ type: 'answer-refused', payload: { reason: 'AnswerTooLateError' } }).refusal).toBe('AnswerTooLateError');
  });

  it('garde la raison d un refus d entree', () => {
    expect(apres({ type: 'join-failed', payload: { reason: 'SessionNotFoundError' } }).error).toBe('SessionNotFoundError');
  });
});
