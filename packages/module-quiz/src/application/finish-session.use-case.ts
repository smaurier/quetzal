import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import { instantDeFermeture } from '../domain/deadline.js';
import { InvalidSessionTransitionError, SessionNotFoundError } from '../domain/errors.js';
import { peutPasserA } from '../domain/session-status.js';
import type { SessionRepository } from '../domain/ports/session.repository.js';
import { comptesDeFermeture, type Horloge } from './run-question.use-case.js';
import { construireClassement, questionsJouees } from './session-report.use-case.js';

@Injectable()
export class FinishSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maintenant: Horloge,
    private readonly eventBus?: EventBus) {}

  async execute(input: { sessionId: string }): Promise<void> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);
    if (!peutPasserA(session.status, 'terminee')) {
      throw new InvalidSessionTransitionError(session.status, 'terminee');
    }

    // Deux écritures du port, non atomiques : fermer la question puis passer le
    // statut. Dans cet ordre, un échec entre les deux laisse une séance encore
    // `en-cours` sans question ouverte, que ce même appel relancé termine. L'ordre
    // inverse laisserait une séance `terminee` à question ouverte, irréparable.
    const ouverte = session.questions.find((q) => q.openedAt !== null && q.closedAt === null);
    if (ouverte !== undefined) {
      const closedAt = new Date(instantDeFermeture(ouverte.deadlineAt?.getTime() ?? null, this.maintenant()));
      await this.sessions.closeQuestion({ sessionQuestionId: ouverte.id, closedAt });
    }
    await this.sessions.setStatus(session.id, 'terminee');

    if (this.eventBus === undefined) return;

    if (ouverte !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.question.closed', {
        sessionId: session.id,
        ...comptesDeFermeture(ouverte.id, await this.sessions.answersFor(ouverte.id)),
      });
    }

    // Le meneur est la première ligne du classement du retour, ou `null` quand
    // personne n'a marqué un point : afficher un vainqueur à zéro sur le dernier
    // écran que voit la classe serait faux.
    const classement = construireClassement(
      session.participants,
      questionsJouees(session.questions),
      await this.sessions.allAnswers(session.id));
    const meneur = classement[0];

    await emitQuiz(this.eventBus, 'quiz.session.finished', {
      sessionId: session.id,
      questionCount: session.questions.length,
      participantCount: session.participants.length,
      topParticipantId: meneur !== undefined && meneur.score > 0 ? meneur.participantId : null,
    });
  }
}
