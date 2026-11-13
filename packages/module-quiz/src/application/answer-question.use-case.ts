import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import { estJuste, type QuestionJouable } from '../domain/answer-check.js';
import { accueilDeLaReponse } from '../domain/deadline.js';
import { pointsPour } from '../domain/scoring.js';
import {
  AlreadyAnsweredError,
  AnswerTooLateError,
  InvalidAnswerError,
  NoQuestionOpenError,
  ParticipantNotFoundError,
  QuestionNotFoundError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';
import { comptesDeFermeture, type FermetureResultat, type Horloge } from './run-question.use-case.js';

export interface ReponseEnregistree {
  answerId: string;
  sessionQuestionId: string;
  participantId: string;
  isCorrect: boolean;
  points: number;
  dansLaGrace: boolean;
  elapsedMs: number;
  /**
   * Non nul quand la réponse arrive dans la grâce d'une question DÉJÀ fermée :
   * les comptes annoncés à la fermeture ne la contiennent pas, la présentation
   * doit rediffuser ceux-ci (et le classement).
   */
  fermetureMiseAJour: FermetureResultat | null;
}

@Injectable()
export class AnswerQuestionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maintenant: Horloge,
    private readonly eventBus?: EventBus) {}

  async execute(input: {
    sessionId: string;
    sessionQuestionId: string;
    participantId: string;
    guestId: string;
    optionId?: string;
    value?: string;
  }): Promise<ReponseEnregistree> {
    const session = await this.require(input.sessionId);
    if (session.status !== 'en-cours') throw new NoQuestionOpenError(session.id);
    // La doublure comme la base acceptent tout participant du locataire : seule
    // cette lecture tient la frontière de la séance.
    if (!session.participants.some((p) => p.id === input.participantId)) {
      throw new ParticipantNotFoundError(input.participantId);
    }

    const question = session.questions.find((q) => q.id === input.sessionQuestionId);
    if (question === undefined) throw new QuestionNotFoundError(input.sessionQuestionId);
    if (question.openedAt === null) throw new NoQuestionOpenError(session.id);
    const openedAtMs = question.openedAt.getTime();
    const deadlineAtMs = question.deadlineAt === null ? null : question.deadlineAt.getTime();

    const arriveeMs = this.maintenant();
    const accueil = accueilDeLaReponse(
      { deadlineAt: deadlineAtMs, closedAt: question.closedAt === null ? null : question.closedAt.getTime() },
      arriveeMs);
    if (accueil.kind === 'trop-tard') throw new AnswerTooLateError(accueil.raison);
    const dansLaGrace = accueil.kind === 'dans-la-grace';

    const ecrite = ecritureDe(input);
    const isCorrect = estJuste(jouable(question), {
      ...(input.optionId === undefined ? {} : { optionId: input.optionId }),
      ...(input.value === undefined ? {} : { texte: input.value }),
    });

    // Une arrivée de grâce est ramenée à l'échéance : le reste y vaut zéro, donc
    // BASE sans bonus (D7 propriété 3), même après une fermeture manuelle
    // antérieure à l'échéance.
    const points = pointsPour(
      { mode: session.mode, openedAt: openedAtMs, deadlineAt: deadlineAtMs },
      { isCorrect, arriveeMs: dansLaGrace && deadlineAtMs !== null ? deadlineAtMs : arriveeMs });
    const elapsedMs = arriveeMs - openedAtMs;

    const ligne = await this.sessions.enregistrerReponse({
      sessionQuestionId: question.id,
      participantId: input.participantId,
      authorGuestId: input.guestId,
      optionId: ecrite.optionId,
      value: ecrite.value,
      isCorrect,
      elapsedMs,
      points,
    });
    if (ligne === null) throw new AlreadyAnsweredError(input.participantId);

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.answer.recorded', {
        sessionId: session.id,
        sessionQuestionId: question.id,
        participantId: input.participantId,
        isCorrect,
        points,
      });
    }

    const fermetureMiseAJour =
      question.closedAt === null
        ? null
        : comptesDeFermeture(question.id, await this.sessions.answersFor(question.id));

    return {
      answerId: ligne.id,
      sessionQuestionId: question.id,
      participantId: input.participantId,
      isCorrect,
      points,
      dansLaGrace,
      elapsedMs,
      fermetureMiseAJour,
    };
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}

/**
 * D5 : une forme fausse (proposition inconnue, saisie vide, forme de l'autre
 * mode) est comptée FAUSSE par `estJuste`, jamais refusée. Seule l'absence des
 * deux champs l'est : la ligne violerait `Quiz_Answer_option_ou_valeur_check`.
 */
function ecritureDe(input: { optionId?: string; value?: string }): {
  optionId: string | null;
  value: string | null;
} {
  if (input.optionId === undefined && input.value === undefined) {
    throw new InvalidAnswerError('ni proposition ni saisie');
  }
  return { optionId: input.optionId ?? null, value: input.value ?? null };
}

function jouable(question: FrozenQuestion): QuestionJouable {
  if (question.answerMode === 'choix') {
    return {
      answerMode: 'choix',
      options: question.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    };
  }
  return {
    answerMode: 'saisie',
    acceptedAnswers: question.acceptedAnswers,
    regles: question.regles,
  };
}
