import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import {
  InvalidSessionTransitionError,
  NoQuestionLeftError,
  NoQuestionOpenError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';

export type Horloge = () => number;

export interface FermetureResultat {
  sessionQuestionId: string;
  answerCount: number;
  correctCount: number;
}

@Injectable()
export class RunQuestionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maintenant: Horloge,
    private readonly eventBus?: EventBus) {}

  async current(input: { sessionId: string }): Promise<FrozenQuestion | null> {
    const session = await this.require(input.sessionId);
    return this.ouverteDe(session);
  }

  async openNext(input: { sessionId: string }): Promise<FrozenQuestion> {
    const session = await this.require(input.sessionId);
    if (session.status !== 'en-cours') {
      throw new InvalidSessionTransitionError(session.status, 'en-cours');
    }

    const suivante = session.questions.find((q) => q.openedAt === null);
    if (suivante === undefined) {
      throw new NoQuestionLeftError(session.id);
    }

    // Deux écritures du port, non atomiques : fermer N puis ouvrir N+1. Un échec
    // entre les deux laisse N fermée et rien d'ouvert, état que ce même appel
    // relancé répare sans rien écraser.
    const precedente = this.ouverteDe(session);
    if (precedente !== null) await this.fermer(session, precedente);

    const openedAt = new Date(this.maintenant());
    const deadlineAt =
      suivante.timeLimitResolved === null
        ? null
        : new Date(openedAt.getTime() + suivante.timeLimitResolved * 1000);

    await this.sessions.openQuestion({
      sessionQuestionId: suivante.id,
      openedAt,
      deadlineAt,
    });

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.question.opened', {
        sessionId: session.id,
        sessionQuestionId: suivante.id,
        rank: suivante.rank,
        timeLimitResolved: suivante.timeLimitResolved,
      });
    }

    return { ...suivante, openedAt, deadlineAt };
  }

  async close(input: { sessionId: string }): Promise<FermetureResultat> {
    const session = await this.require(input.sessionId);
    const ouverte = this.ouverteDe(session);
    if (ouverte === null) throw new NoQuestionOpenError(session.id);
    return this.fermer(session, ouverte);
  }

  private async fermer(session: Session, ouverte: FrozenQuestion): Promise<FermetureResultat> {
    const maintenant = this.maintenant();
    // La grace s'ajoute a la fin effective dans `accueilDeLaReponse` : la
    // compter ici aussi l'accorderait deux fois.
    const fin = ouverte.deadlineAt === null ? maintenant : ouverte.deadlineAt.getTime();
    const closedAt = new Date(Math.min(maintenant, fin));
    await this.sessions.closeQuestion({ sessionQuestionId: ouverte.id, closedAt });

    const reponses = await this.sessions.answersFor(ouverte.id);
    const resultat: FermetureResultat = {
      sessionQuestionId: ouverte.id,
      answerCount: reponses.length,
      correctCount: reponses.filter((r) => r.isCorrect).length,
    };

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.question.closed', {
        sessionId: session.id,
        ...resultat,
      });
    }

    return resultat;
  }

  private ouverteDe(session: Session): FrozenQuestion | null {
    return session.questions.find((q) => q.openedAt !== null && q.closedAt === null) ?? null;
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
