import { Inject, Injectable } from '@nestjs/common';
import { logger, rooms } from '@quetzal/core';
import type { Server } from 'socket.io';
import { ManageSessionUseCase, type VueDeSalle } from '../application/manage-session.use-case.js';
import type { FermetureResultat } from '../application/run-question.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import type { FrozenQuestion } from '../domain/ports/session.repository.js';

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
 * ⛔ Ce que la salle et un invité lisent d'une séance. Tant qu'une question est
 * ouverte, le score est celui d'AVANT elle (`scoresVisibles`) : un score qui
 * bouge dit qui a déjà répondu juste, donc sur qui copier.
 */
export function etatPourLaSalle({ session, scoresVisibles }: VueDeSalle) {
  return {
    id: session.id,
    status: session.status,
    mode: session.mode,
    joinCode: session.joinCode,
    questionCount: session.questions.length,
    participants: session.participants.map((p) => ({
      id: p.id,
      participantIndex: p.participantIndex,
      name: p.name,
      score: scoresVisibles.get(p.id) ?? 0,
      memberNames: p.memberNames,
    })),
  };
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
   * jamais : la commande est déjà persistée quand la diffusion part. Lever
   * rendrait un 500 sur une ouverture réussie (l'animatrice reclique, et
   * « suivante » saute N+1), ou un refus derrière un résultat déjà envoyé.
   */
  private emit(room: string, event: string, payload: unknown): void {
    if (this.server === null) {
      logger.error(
        { module: 'quiz', action: 'broadcast.detached', event, room },
        'quiz: diffusion demandée avant attachement du serveur');
      return;
    }
    try {
      this.server.to(room).emit(event, payload);
    } catch (err) {
      this.journaliser(err, event, room);
    }
  }

  private journaliser(err: unknown, event: string, room: string): void {
    logger.error({ err, module: 'quiz', action: 'broadcast.failed', event, room }, 'quiz: diffusion en échec');
  }

  private room(sessionId: string): string {
    return rooms.session('quiz', sessionId);
  }

  private participantRoom(sessionId: string, participantId: string): string {
    return rooms.subgroup('quiz', sessionId, participantId);
  }

  async sessionChanged(sessionId: string): Promise<void> {
    try {
      const vue = await this.sessions.vueDeSalle({ sessionId });
      this.emit(this.room(sessionId), 'session-changed', etatPourLaSalle(vue));
    } catch (err) {
      this.journaliser(err, 'session-changed', this.room(sessionId));
    }
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
    try {
      const rapport = await this.report.execute({ sessionId });
      this.emit(this.room(sessionId), 'session-finished', {
        questionCount: rapport.questionCount,
        classement: rapport.classement.map((ligne) => ({
          participantId: ligne.participantId,
          label: ligne.label,
          score: ligne.score,
        })),
      });
    } catch (err) {
      this.journaliser(err, 'session-finished', this.room(sessionId));
    }
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
