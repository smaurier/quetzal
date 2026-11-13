import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { AnswerQuestionUseCase } from './application/answer-question.use-case.js';
import { JoinSessionUseCase } from './application/join-session.use-case.js';
import { FinishSessionUseCase } from './application/finish-session.use-case.js';
import { RunQuestionUseCase } from './application/run-question.use-case.js';
import { FakeSessionRepository, sessionOf } from './application/testing/fake-repositories.js';
import { QUIZ_SESSIONS, QuizModule } from './quiz.module.js';
import { QuizBroadcaster } from './presentation/quiz.broadcaster.js';
import { QuizGateway } from './presentation/quiz.gateway.js';

/**
 * L'horloge est un paramètre OBLIGATOIRE de ces deux cas d'usage, sans défaut :
 * un câblage qui l'oublierait compilerait (`useFactory` n'est pas typé contre
 * le constructeur) et ne casserait qu'au premier clic d'Elda, en
 * « maintenant is not a function ».
 */
describe('QuizModule, horloge', () => {
  async function compiler() {
    const sessions = new FakeSessionRepository();
    const moduleRef = await Test.createTestingModule({ imports: [QuizModule] })
      .overrideProvider(QUIZ_SESSIONS)
      .useValue(sessions)
      .compile();
    return { sessions, moduleRef };
  }

  it('fournit l heure courante a RunQuestionUseCase', async () => {
    const { sessions, moduleRef } = await compiler();
    sessions.add(sessionOf({ status: 'en-cours' }));

    const avant = Date.now();
    const ouverte = await moduleRef.get(RunQuestionUseCase).openNext({ sessionId: 'session-1' });
    const apres = Date.now();

    expect(ouverte.openedAt?.getTime()).toBeGreaterThanOrEqual(avant);
    expect(ouverte.openedAt?.getTime()).toBeLessThanOrEqual(apres);
  });

  it('fournit l heure courante a FinishSessionUseCase', async () => {
    const { sessions, moduleRef } = await compiler();
    sessions.add(sessionOf({ status: 'en-cours' }));
    await moduleRef.get(RunQuestionUseCase).openNext({ sessionId: 'session-1' });

    const avant = Date.now();
    await moduleRef.get(FinishSessionUseCase).execute({ sessionId: 'session-1' });
    const apres = Date.now();

    const fermee = (await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime();
    expect(fermee).toBeGreaterThanOrEqual(avant);
    expect(fermee).toBeLessThanOrEqual(apres);
  });

  it('fournit l heure courante a AnswerQuestionUseCase', async () => {
    const { sessions, moduleRef } = await compiler();
    sessions.add(sessionOf({ status: 'en-cours' }));
    const ouverte = await moduleRef.get(RunQuestionUseCase).openNext({ sessionId: 'session-1' });
    const ana = await moduleRef.get(JoinSessionUseCase).execute({
      sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana',
    });

    const r = await moduleRef.get(AnswerQuestionUseCase).execute({
      sessionId: 'session-1',
      sessionQuestionId: ouverte.id,
      participantId: ana.participantId,
      guestId: 'g-1',
      optionId: 'o-juste-1',
    });

    // Une horloge absente rendrait NaN, et une horloge figée hors de la
    // fenêtre refuserait la réponse : un délai positif et court dit l'heure vraie.
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(r.elapsedMs).toBeLessThan(5_000);
  });

  it('branche la passerelle et le diffuseur', async () => {
    const { moduleRef } = await compiler();
    expect(moduleRef.get(QuizGateway)).toBeInstanceOf(QuizGateway);
    expect(moduleRef.get(QuizBroadcaster)).toBeInstanceOf(QuizBroadcaster);
  });
});
