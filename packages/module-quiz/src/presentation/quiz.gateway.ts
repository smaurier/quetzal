import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DomainError, logger, rooms } from '@quetzal/core';
import type { Server, Socket } from 'socket.io';
import { AnswerQuestionUseCase } from '../application/answer-question.use-case.js';
import { JoinSessionUseCase } from '../application/join-session.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { answerMessageSchema, guestDisplayNameSchema } from './dto/quiz.dto.js';
import { participantsPourLaSalle, QuizBroadcaster, questionPourLaSalle } from './quiz.broadcaster.js';

interface SocketData {
  role?: string;
  guestId?: string;
  displayName?: string;
  sessionId?: string;
  participantId?: string;
}

const NOM_INVALIDE = 'InvalidDisplayName';
const REPONSE_INVALIDE = 'InvalidAnswerError';

/**
 * Le NOM de la classe d'erreur, que l'écran traduit. Jamais le message, et
 * jamais le nom d'une erreur technique : ils finiraient sur le téléphone d'un
 * élève de collège.
 */
function raisonDe(err: unknown): string {
  return err instanceof DomainError ? err.name : 'InternalError';
}

// CORS et authentification du handshake appartiennent à l'adaptateur de la
// plateforme, jamais au module (CLAUDE.md §3).
@WebSocketGateway({ namespace: 'ws/quiz' })
export class QuizGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  // Jetons explicites : le transform esbuild de Vitest n'émet pas la métadonnée
  // de type que Nest utiliserait sinon (même piège que chez le loto).
  constructor(
    @Inject(JoinSessionUseCase) private readonly join: JoinSessionUseCase,
    @Inject(AnswerQuestionUseCase) private readonly answer: AnswerQuestionUseCase,
    @Inject(RunQuestionUseCase) private readonly questions: RunQuestionUseCase,
    @Inject(ManageSessionUseCase) private readonly sessions: ManageSessionUseCase,
    @Inject(QuizBroadcaster) private readonly broadcaster: QuizBroadcaster) {}

  // `afterInit` et non `handleConnection` : issue #34 du loto, toute diffusion
  // antérieure à la première connexion partait sinon dans le vide, sans erreur.
  afterInit(server: Server): void {
    this.broadcaster.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const data = client.data as SocketData;

    // Un invité tient sa séance de son JETON : il ne peut pas en viser une
    // autre. Une animatrice la passe en query, et le cloisonnement par
    // locataire fait le reste.
    const sessionId =
      data.role === 'guest' ? data.sessionId : queryValue(client.handshake.query['sessionId']);
    if (sessionId === undefined) {
      client.disconnect(true);
      return;
    }
    data.sessionId = sessionId;

    try {
      if (data.role === 'guest' && data.guestId !== undefined) {
        // Le jeton borne le nom à 32 sans le nettoyer : un nom fait d'espaces y passe.
        const nom = guestDisplayNameSchema.safeParse(data.displayName ?? 'Invité');
        if (!nom.success) {
          client.emit('join-failed', { reason: NOM_INVALIDE });
          client.disconnect(true);
          return;
        }
        const place = await this.join.execute({ sessionId, guestId: data.guestId, displayName: nom.data });
        data.participantId = place.participantId;
        await client.join(rooms.subgroup('quiz', sessionId, place.participantId));
      }

      await client.join(rooms.session('quiz', sessionId));

      const session = await this.sessions.findOne({ sessionId });
      const courante = await this.questions.current({ sessionId });
      client.emit('state', {
        session: {
          id: session.id,
          status: session.status,
          mode: session.mode,
          questionCount: session.questions.length,
          participants: participantsPourLaSalle(session.participants),
        },
        participantId: data.participantId ?? null,
        question: courante === null ? null : questionPourLaSalle(courante),
      });

      if (data.participantId !== undefined) await this.broadcaster.sessionChanged(sessionId);
    } catch (err) {
      logger.warn({ err, sessionId }, 'quiz: connexion refusée');
      client.emit('join-failed', { reason: raisonDe(err) });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('answer')
  async handleAnswer(@MessageBody() body: unknown, @ConnectedSocket() client: Socket): Promise<void> {
    const data = client.data as SocketData;
    const { sessionId, participantId, guestId } = data;
    if (sessionId === undefined || participantId === undefined || guestId === undefined) return;

    const message = answerMessageSchema.safeParse(body);
    if (!message.success) {
      this.broadcaster.answerRefused(sessionId, participantId, REPONSE_INVALIDE);
      return;
    }

    try {
      const r = await this.answer.execute({
        sessionId,
        sessionQuestionId: message.data.sessionQuestionId,
        participantId,
        guestId,
        ...(message.data.optionId === undefined ? {} : { optionId: message.data.optionId }),
        ...(message.data.value === undefined ? {} : { value: message.data.value }),
      });
      // Diffusé vers le seul participant, jamais retourné : Nest transformerait
      // un retour {event, data} en événement, piège du loto du 03/09.
      this.broadcaster.answerAcknowledged(sessionId, participantId, {
        isCorrect: r.isCorrect,
        points: r.points,
        dansLaGrace: r.dansLaGrace,
      });
      if (r.fermetureMiseAJour !== null) {
        await this.broadcaster.questionClosed(sessionId, r.fermetureMiseAJour);
      }
    } catch (err) {
      if (!(err instanceof DomainError)) logger.error({ err, sessionId }, 'quiz: réponse en échec');
      // Un refus d'échéance ou un double appui n'est PAS une panne : l'élève
      // doit le lire, pas voir sa page casser.
      this.broadcaster.answerRefused(sessionId, participantId, raisonDe(err));
    }
  }
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
