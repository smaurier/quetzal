import { Inject, Injectable } from '@nestjs/common';
import { logger, rooms } from '@quetzal/core';
import type { Server } from 'socket.io';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import type { FermetureResultat } from '../application/run-question.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import type { FrozenQuestion, Participant, Session } from '../domain/ports/session.repository.js';

/**
 * ⛔ LA CHARGE LA PLUS DANGEREUSE DU MODULE. Elle part vers les téléphones des
 * élèves (question-opened, et l'état initial d'une reconnexion), donc elle ne
 * porte NI `isCorrect`, NI `acceptedAnswers` : la réponse serait dans l'onglet
 * réseau, où un élève curieux la lit en trois gestes. Liste blanche, jamais un
 * spread de la question figée.
 */
export function questionPourLaSalle(question: FrozenQuestion) {
  return {
    sessionQuestionId: question.id,
    rank: question.rank,
    prompt: question.prompt,
    imageId: question.imageId,
    imageAlt: question.imageAlt,
    answerMode: question.answerMode,
    timeLimitResolved: question.timeLimitResolved,
    deadlineAt: question.deadlineAt?.toISOString() ?? null,
    options: question.options.map((option) => ({
      id: option.id,
      rank: option.rank,
      label: option.label,
      imageId: option.imageId,
      imageAlt: option.imageAlt,
    })),
  };
}

/**
 * ⛔ Tant qu'une question est ouverte, la salle lit le score d'AVANT elle : un
 * score qui bouge dit qui a déjà répondu juste, donc sur qui copier. Les
 * points de la question ouverte sont ceux de ses réponses, retirés ici.
 */
export function participantsPourLaSalle(
  participants: readonly Participant[],
  reponsesDeLaQuestionOuverte: readonly { participantId: string; points: number }[]) {
  return participants.map((p) => ({
    id: p.id,
    participantIndex: p.participantIndex,
    name: p.name,
    score: p.score - reponsesDeLaQuestionOuverte
      .filter((r) => r.participantId === p.id)
      .reduce((total, r) => total + r.points, 0),
    memberNames: p.memberNames,
  }));
}

/**
 * Le contrôleur HTTP exécute la commande, le diffuseur prévient la salle (D9).
 */
@Injectable()
export class QuizBroadcaster {
  private server: Server | null = null;

  constructor(
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(SessionReportUseCase) private readonly report: SessionReportUseCase) {}

  attach(server: Server): void {
    this.server = server;
  }

  /**
   * Pas muet (issue #34 du loto : un `?.` avalait l'émission), mais ne lève
   * pas : la commande HTTP est déjà persistée quand la diffusion part, échouer
   * ici rendrait un 500 sur une opération réussie.
   */
  private emit(room: string, event: string, payload: unknown): void {
    if (this.server === null) {
      logger.error(
        { module: 'quiz', action: 'broadcast.detached', event, room },
        'quiz: diffusion demandée avant attachement du serveur');
      return;
    }
    this.server.to(room).emit(event, payload);
  }

  private room(sessionId: string): string {
    return rooms.session('quiz', sessionId);
  }

  private participantRoom(sessionId: string, participantId: string): string {
    return rooms.subgroup('quiz', sessionId, participantId);
  }

  /** Les participants tels que la salle et un invité peuvent les lire. */
  async participantsVisibles(session: Session) {
    const ouverte = session.questions.find((q) => q.openedAt !== null && q.closedAt === null);
    if (ouverte === undefined) return participantsPourLaSalle(session.participants, []);
    const rapport = await this.report.execute({ sessionId: session.id });
    const reponses = rapport.questions.find((q) => q.sessionQuestionId === ouverte.id)?.answers ?? [];
    return participantsPourLaSalle(session.participants, reponses);
  }

  async sessionChanged(sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({ sessionId });
    this.emit(this.room(sessionId), 'session-changed', {
      id: session.id,
      status: session.status,
      mode: session.mode,
      joinCode: session.joinCode,
      questionCount: session.questions.length,
      participants: await this.participantsVisibles(session),
    });
  }

  async questionOpened(sessionId: string, question: FrozenQuestion): Promise<void> {
    this.emit(this.room(sessionId), 'question-opened', questionPourLaSalle(question));
  }

  async questionClosed(sessionId: string, resultat: FermetureResultat): Promise<void> {
    this.emit(this.room(sessionId), 'question-closed', resultat);
    await this.sessionChanged(sessionId);
  }

  /**
   * Le podium part à toute la salle. Le détail juste / faux / absent de chaque
   * élève reste le retour d'Elda, servi par sa route : sur le téléphone du
   * voisin, ce serait publier les résultats d'un contrôle.
   */
  async sessionFinished(sessionId: string): Promise<void> {
    const rapport = await this.report.execute({ sessionId });
    this.emit(this.room(sessionId), 'session-finished', {
      questionCount: rapport.questionCount,
      classement: rapport.classement.map((ligne) => ({
        participantId: ligne.participantId,
        label: ligne.label,
        score: ligne.score,
      })),
    });
  }

  /** Dire juste ou faux à la salle pendant que les autres répondent encore fuiterait la réponse. */
  answerAcknowledged(
    sessionId: string,
    participantId: string,
    payload: { isCorrect: boolean; points: number; dansLaGrace: boolean }): void {
    this.emit(this.participantRoom(sessionId, participantId), 'answer-result', payload);
  }

  answerRefused(sessionId: string, participantId: string, reason: string): void {
    this.emit(this.participantRoom(sessionId, participantId), 'answer-refused', { reason });
  }
}
