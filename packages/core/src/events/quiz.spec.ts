import { describe, it, expect } from 'vitest';
import type { EventBus, EventName } from '../module-contract.js';
import { emitQuiz } from './quiz.js';

/**
 * Motif de l'issue #53 : sans table nom -> charge, les interfaces d'événements
 * sont DECORATIVES. `EventBus.emit<T = unknown>(name: EventName, payload: T)`
 * laisse `T` libre et `EventName` est un gabarit, donc n'importe quel nom avec
 * n'importe quelle charge compile. Mesuré sur le loto : quatre interfaces
 * declaraient un `tenantId` qu'aucune emission n'envoyait, pendant des mois.
 */
class BusEspion implements EventBus {
  readonly emis: { name: EventName; payload: unknown }[] = [];

  async emit(name: EventName, payload: unknown): Promise<void> {
    this.emis.push({ name, payload });
  }

  on(): void {
    // Aucun abonne dans ce test : on juge ce qui part, pas ce qui arrive.
  }
}

describe('emitQuiz', () => {
  it('transmet le nom et la charge au bus, sans les alterer', async () => {
    const bus = new BusEspion();

    await emitQuiz(bus, 'quiz.session.started', {
      sessionId: 's-1',
      deckId: 'b-1',
      mode: 'defi',
      questionCount: 8,
      participantCount: 6,
    });

    expect(bus.emis).toEqual([
      {
        name: 'quiz.session.started',
        payload: {
          sessionId: 's-1',
          deckId: 'b-1',
          mode: 'defi',
          questionCount: 8,
          participantCount: 6,
        },
      },
    ]);
  });

  it('transmet les cinq evenements de la spec', async () => {
    const bus = new BusEspion();

    await emitQuiz(bus, 'quiz.question.opened', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      rank: 1,
      timeLimitResolved: 20,
    });
    await emitQuiz(bus, 'quiz.answer.recorded', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      participantId: 'p-1',
      isCorrect: true,
      points: 1200,
    });
    await emitQuiz(bus, 'quiz.question.closed', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      answerCount: 5,
      correctCount: 3,
    });
    await emitQuiz(bus, 'quiz.session.finished', {
      sessionId: 's-1',
      questionCount: 8,
      participantCount: 6,
      topParticipantId: 'p-2',
    });

    expect(bus.emis.map((e) => e.name)).toEqual([
      'quiz.question.opened',
      'quiz.answer.recorded',
      'quiz.question.closed',
      'quiz.session.finished',
    ]);
  });
});
