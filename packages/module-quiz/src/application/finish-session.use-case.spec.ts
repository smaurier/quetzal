import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { InvalidSessionTransitionError, SessionNotFoundError } from '../domain/errors.js';
import type { NewAnswer } from '../domain/ports/session.repository.js';
import { FinishSessionUseCase } from './finish-session.use-case.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './testing/fake-repositories.js';

const T0 = 1_700_000_000_000;

class RecordingBus implements EventBus {
  readonly emitted: { name: string; payload: unknown }[] = [];
  emit<T = unknown>(name: string, payload: T): Promise<void> {
    this.emitted.push({ name, payload });
    return Promise.resolve();
  }
  on(): void {}
}

function build(maintenant = T0 + 5_000) {
  const sessions = new FakeSessionRepository();
  const bus = new RecordingBus();
  const useCase = new FinishSessionUseCase(sessions, () => maintenant, bus);
  return { sessions, bus, useCase };
}

function reponse(sessionQuestionId: string, participantId: string, isCorrect: boolean): NewAnswer {
  return {
    sessionQuestionId, participantId, authorGuestId: `g-${participantId}`, isCorrect,
    elapsedMs: 100, points: 0, optionId: null, value: null,
  };
}

const PARTICIPANTS = [
  { id: 'p-1', participantIndex: 1, name: 'Les lynx', score: 2200, memberNames: ['Ana'] },
  { id: 'p-2', participantIndex: 2, name: null, score: 1000, memberNames: ['Bea'] },
];

describe('FinishSessionUseCase', () => {
  it('termine une seance en cours', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours', participants: PARTICIPANTS }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });

  it('termine aussi une seance ouverte mais jamais commencee', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });

  it('termine aussi un brouillon : une animatrice qui change d avis doit pouvoir clore', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'brouillon', questions: [] }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });

  it('refuse de terminer deux fois, sans rien ecrire ni emettre la seconde fois', async () => {
    const { sessions, bus, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours', participants: PARTICIPANTS }));
    await useCase.execute({ sessionId: 'session-1' });
    const emisesApresLePremier = bus.emitted.length;

    await expect(useCase.execute({ sessionId: 'session-1' })).rejects.toThrow(InvalidSessionTransitionError);

    expect(bus.emitted).toHaveLength(emisesApresLePremier);
    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });

  /**
   * Meme regle de fermeture que « question suivante » : `closedAt` ne depasse
   * jamais l'echeance, sinon la grace partirait d'un instant trop tardif.
   */
  it('ferme la question ouverte a maintenant, quand l echeance n est pas passee', async () => {
    const { sessions, useCase } = build(T0 + 5_000);
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 5_000);
  });

  it('ferme la question ouverte a l echeance quand elle est depassee', async () => {
    const { sessions, useCase } = build(T0 + 90_000);
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 20_000);
  });

  it('ferme a maintenant une question sans echeance (mode controle)', async () => {
    const { sessions, useCase } = build(T0 + 90_000);
    sessions.add(sessionOf({
      mode: 'controle',
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { timeLimitResolved: null, openedAt: new Date(T0) })],
    }));

    await useCase.execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 90_000);
  });

  /**
   * Fermer et terminer sont deux ecritures du port, non atomiques. L'ordre est
   * ce qui les rend reparables : un echec a la fermeture laisse la seance
   * `en-cours`, et relancer termine. L'ordre inverse laisserait une seance
   * terminee a question ouverte, que la machine d'etats refuse de rouvrir.
   */
  it('reste en cours si la fermeture echoue, et relancer termine', async () => {
    class FermetureEnPanne extends FakeSessionRepository {
      panne = true;
      override async closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void> {
        if (this.panne) throw new Error('panne simulee');
        await super.closeQuestion(input);
      }
    }
    const sessions = new FermetureEnPanne();
    const useCase = new FinishSessionUseCase(sessions, () => T0 + 5_000);
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0) })],
    }));

    await expect(useCase.execute({ sessionId: 'session-1' })).rejects.toThrow('panne simulee');
    expect((await sessions.findById('session-1'))?.status).toBe('en-cours');

    sessions.panne = false;
    await useCase.execute({ sessionId: 'session-1' });
    const lue = await sessions.findById('session-1');
    expect(lue?.status).toBe('terminee');
    expect(lue?.questions[0]?.closedAt?.getTime()).toBe(T0 + 5_000);
  });

  it('ne touche pas une question deja fermee ni une question jamais ouverte', async () => {
    const { sessions, useCase } = build(T0 + 90_000);
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 4_000) }),
        frozenQuestionOf(2),
      ],
    }));

    await useCase.execute({ sessionId: 'session-1' });

    const lue = await sessions.findById('session-1');
    expect(lue?.questions[0]?.closedAt?.getTime()).toBe(T0 + 4_000);
    expect(lue?.questions[1]?.closedAt).toBeNull();
    expect(lue?.questions[1]?.openedAt).toBeNull();
  });

  it('annonce la fermeture de la question ouverte avant la fin de la seance', async () => {
    const { sessions, bus, useCase } = build();
    const ouverte = frozenQuestionOf(1, { openedAt: new Date(T0) });
    sessions.add(sessionOf({ status: 'en-cours', questions: [ouverte], participants: PARTICIPANTS }));
    sessions.poserReponse(reponse(ouverte.id, 'p-1', true));
    sessions.poserReponse(reponse(ouverte.id, 'p-2', false));

    await useCase.execute({ sessionId: 'session-1' });

    expect(bus.emitted.map((e) => e.name)).toEqual(['quiz.question.closed', 'quiz.session.finished']);
    expect(bus.emitted[0]?.payload).toEqual({
      sessionId: 'session-1', sessionQuestionId: ouverte.id, answerCount: 2, correctCount: 1,
    });
  });

  it('n annonce pas de fermeture quand aucune question n est ouverte', async () => {
    const { sessions, bus, useCase } = build();
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));

    await useCase.execute({ sessionId: 'session-1' });

    expect(bus.emitted.map((e) => e.name)).toEqual(['quiz.session.finished']);
  });

  it('emet la fin avec les comptes de la seance figee', async () => {
    const { sessions, bus, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours', participants: PARTICIPANTS }));

    await useCase.execute({ sessionId: 'session-1' });

    expect(bus.emitted).toEqual([{
      name: 'quiz.session.finished',
      payload: { sessionId: 'session-1', questionCount: 2, participantCount: 2, topParticipantId: 'p-1' },
    }]);
  });

  /**
   * Afficher un vainqueur a zero sur le dernier ecran que voit la classe
   * serait faux.
   */
  it('n a pas de meneur quand personne n a marque un point', async () => {
    const { sessions, bus, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      participants: PARTICIPANTS.map((p) => ({ ...p, score: 0 })),
    }));

    await useCase.execute({ sessionId: 'session-1' });

    expect(bus.emitted[0]?.payload).toMatchObject({ topParticipantId: null });
  });

  /**
   * Le meneur de l'evenement et la premiere ligne du retour doivent etre la
   * meme personne : un seul classement, un seul departage.
   */
  it('designe comme meneur la premiere ligne du classement, departage compris', async () => {
    const { sessions, bus, useCase } = build();
    const q1 = frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) });
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [q1],
      participants: [
        { id: 'a', participantIndex: 1, name: 'A', score: 500, memberNames: ['x'] },
        { id: 'b', participantIndex: 2, name: 'B', score: 500, memberNames: ['y'] },
      ],
    }));
    sessions.poserReponse(reponse(q1.id, 'a', false));
    sessions.poserReponse(reponse(q1.id, 'b', true));

    await useCase.execute({ sessionId: 'session-1' });

    expect(bus.emitted[0]?.payload).toMatchObject({ topParticipantId: 'b' });
  });

  it('termine sans bus d evenements', async () => {
    const sessions = new FakeSessionRepository();
    sessions.add(sessionOf({ status: 'en-cours' }));

    await new FinishSessionUseCase(sessions, () => T0).execute({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.status).toBe('terminee');
  });
});
