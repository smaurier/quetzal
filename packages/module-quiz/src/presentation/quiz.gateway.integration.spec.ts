import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Namespace, Server as IoServer, ServerOptions, Socket as ServerSocket } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { AnswerQuestionUseCase } from '../application/answer-question.use-case.js';
import { JoinSessionUseCase } from '../application/join-session.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import {
  FakeQuestionBankRepository,
  FakeSessionRepository,
  sessionOf,
} from '../application/testing/fake-repositories.js';
import { QuizBroadcaster } from './quiz.broadcaster.js';
import { QuizGateway } from './quiz.gateway.js';
import { clesProfondes } from './testing/doublures-ws.js';

const INVITES: Record<string, { guestId: string; displayName: string }> = {
  'jeton-ana': { guestId: 'g-ana', displayName: 'Ana' },
  'jeton-beto': { guestId: 'g-beto', displayName: 'Beto' },
};

/**
 * Ce que fait l'adaptateur de la plateforme (`apps/api/src/ws/`), en miniature :
 * poser l'identité sur `socket.data` au handshake. Le module ne peut pas
 * importer `apps/api` (§3), donc ce faux vit ici.
 */
class FakeHandshakeAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly sessionId: string) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): IoServer {
    return super.createIOServer(port, options) as IoServer;
  }

  override bindClientConnect(server: Namespace, callback: (socket: ServerSocket) => void): void {
    server.use((socket, next) => {
      const auth = (socket.handshake.auth ?? {}) as { guestToken?: string };
      const invite = auth.guestToken === undefined ? undefined : INVITES[auth.guestToken];
      if (invite === undefined) {
        next(new Error('identité de test inconnue'));
        return;
      }
      socket.data = { role: 'guest', tenantId: 't1', sessionId: this.sessionId, ...invite };
      next();
    });
    super.bindClientConnect(server, callback);
  }
}

interface Etat {
  participantId: string;
}

/** Sur un vrai serveur socket.io : ce qui est prouvé ici est le routage par salle. */
describe('QuizGateway (intégration)', () => {
  let app: INestApplication;
  let url: string;
  let sessions: FakeSessionRepository;

  beforeAll(async () => {
    sessions = new FakeSessionRepository();
    sessions.add(sessionOf({ status: 'en-cours' }));
    const horloge = () => Date.now();
    const manage = new ManageSessionUseCase(sessions, new FakeQuestionBankRepository());

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuizGateway,
        QuizBroadcaster,
        { provide: ManageSessionUseCase, useValue: manage },
        { provide: JoinSessionUseCase, useValue: new JoinSessionUseCase(sessions) },
        { provide: AnswerQuestionUseCase, useValue: new AnswerQuestionUseCase(sessions, horloge) },
        { provide: RunQuestionUseCase, useValue: new RunQuestionUseCase(sessions, horloge) },
        { provide: SessionReportUseCase, useValue: new SessionReportUseCase(sessions) },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useWebSocketAdapter(new FakeHandshakeAdapter(app, 'session-1'));
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  function connecter(guestToken: string): ClientSocket {
    return io(`${url}/ws/quiz`, { transports: ['websocket'], auth: { guestToken }, forceNew: true });
  }

  it('route la question a toute la salle, et le resultat au seul eleve qui a repondu', async () => {
    const ana = connecter('jeton-ana');
    const etatAna = await new Promise<Etat>((resolve) => ana.once('state', resolve));
    const beto = connecter('jeton-beto');
    const etatBeto = await new Promise<Etat>((resolve) => beto.once('state', resolve));

    const questionVueParBeto = new Promise<unknown>((resolve) => beto.once('question-opened', resolve));
    const questionVueParAna = new Promise<{ sessionQuestionId: string }>((resolve) =>
      ana.once('question-opened', resolve));
    const ouverte = await app.get(RunQuestionUseCase).openNext({ sessionId: 'session-1' });
    await app.get(QuizBroadcaster).questionOpened('session-1', ouverte);

    const charge = await questionVueParBeto;
    expect(clesProfondes(charge).has('isCorrect')).toBe(false);
    const { sessionQuestionId } = await questionVueParAna;

    const resultatsDeBeto: unknown[] = [];
    beto.on('answer-result', (r) => resultatsDeBeto.push(r));
    const resultatAna = new Promise((resolve) => ana.once('answer-result', resolve));
    // La charge nomme Beto : la réponse doit rester celle d'Ana.
    ana.emit('answer', { sessionQuestionId, optionId: 'o-juste-1', participantId: etatBeto.participantId });

    expect(await resultatAna).toMatchObject({ isCorrect: true });
    // Beto ne doit rien recevoir : on laisse au serveur le temps d'une diffusion égarée.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(resultatsDeBeto).toHaveLength(0);
    const lignes = await sessions.answersFor(sessionQuestionId);
    expect(lignes.map((l) => l.participantId)).toEqual([etatAna.participantId]);

    ana.close();
    beto.close();
  });
});
