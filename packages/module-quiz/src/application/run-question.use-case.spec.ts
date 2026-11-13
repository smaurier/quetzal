import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import {
  InvalidSessionTransitionError,
  NoQuestionLeftError,
  NoQuestionOpenError,
  SessionNotFoundError,
} from '../domain/errors.js';
import { accueilDeLaReponse } from '../domain/deadline.js';
import type { NewAnswer } from '../domain/ports/session.repository.js';
import type { SessionStatus } from '../domain/session-status.js';
import { RunQuestionUseCase } from './run-question.use-case.js';
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

function build(maintenant = T0) {
  const sessions = new FakeSessionRepository();
  const bus = new RecordingBus();
  let horloge = maintenant;
  const useCase = new RunQuestionUseCase(sessions, () => horloge, bus);
  return {
    sessions,
    bus,
    useCase,
    avancerDe: (ms: number) => { horloge += ms; },
  };
}

function reponse(sessionQuestionId: string, participantId: string, isCorrect: boolean): NewAnswer {
  return {
    sessionQuestionId,
    participantId,
    authorGuestId: `g-${participantId}`,
    optionId: null,
    value: null,
    isCorrect,
    elapsedMs: 900,
    points: isCorrect ? 1200 : 0,
  };
}

describe('RunQuestionUseCase, ouverture', () => {
  it('ouvre la premiere question et pose son echeance a partir du delai fige', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      defaultTimeLimit: 99,
      questions: [frozenQuestionOf(1, { timeLimitResolved: 20 })],
    }));

    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.rank).toBe(1);
    expect(ouverte.deadlineAt?.getTime()).toBe(T0 + 20_000);
    expect(ouverte.openedAt?.getTime()).toBe(T0);
  });

  it('ecrit l ouverture et l echeance dans la seance, pas seulement dans la valeur rendue', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { timeLimitResolved: 20 })],
    }));

    await useCase.openNext({ sessionId: 'session-1' });

    const lue = (await sessions.findById('session-1'))?.questions[0];
    expect(lue?.openedAt?.getTime()).toBe(T0);
    expect(lue?.deadlineAt?.getTime()).toBe(T0 + 20_000);
  });

  it('n a aucune echeance en mode controle', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      mode: 'controle',
      questions: [frozenQuestionOf(1, { timeLimitResolved: null })],
    }));

    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.deadlineAt).toBeNull();
    expect(ouverte.openedAt?.getTime()).toBe(T0);
    expect((await sessions.findById('session-1'))?.questions[0]?.deadlineAt).toBeNull();
  });

  it('passe a la question suivante quand la precedente est fermee, sans toucher a sa fermeture', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 5) }),
        frozenQuestionOf(2),
      ],
    }));

    avancerDe(1_000);
    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.rank).toBe(2);
    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 5);
  });

  it('ouvre les questions dans l ordre des rangs, pas la derniere restante', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 5) }),
        frozenQuestionOf(2),
        frozenQuestionOf(3),
      ],
    }));

    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    const lue = await sessions.findById('session-1');
    expect(ouverte.rank).toBe(2);
    expect(lue?.questions[1]?.openedAt).not.toBeNull();
    expect(lue?.questions[2]?.openedAt).toBeNull();
  });

  it('calcule l echeance de la suivante depuis SON ouverture et SON delai fige', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      defaultTimeLimit: 99,
      questions: [
        frozenQuestionOf(1, { timeLimitResolved: 20, openedAt: new Date(T0), closedAt: new Date(T0 + 5) }),
        frozenQuestionOf(2, { timeLimitResolved: 30 }),
      ],
    }));

    avancerDe(10_000);
    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.deadlineAt?.getTime()).toBe(T0 + 10_000 + 30_000);
  });

  it('ferme la question encore ouverte avant d ouvrir la suivante', async () => {
    const { sessions, useCase, avancerDe } = build();
    const premiere = frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) });
    sessions.add(sessionOf({ status: 'en-cours', questions: [premiere, frozenQuestionOf(2)] }));

    avancerDe(4_000);
    const { ouverte } = await useCase.openNext({ sessionId: 'session-1' });

    const lue = await sessions.findById('session-1');
    expect(ouverte.rank).toBe(2);
    expect(lue?.questions[0]?.closedAt?.getTime()).toBe(T0 + 4_000);
    expect(lue?.questions[1]?.openedAt?.getTime()).toBe(T0 + 4_000);
    expect(lue?.questions[1]?.closedAt).toBeNull();
  });

  it('ferme la precedente meme quand son echeance est depassee sans que personne l ait fermee', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [
        frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) }),
        frozenQuestionOf(2),
      ],
    }));

    avancerDe(60_000);
    await useCase.openNext({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 20_000);
  });

  it('annonce la fermeture de la precedente avec le compte de ses seules reponses', async () => {
    const { sessions, bus, useCase } = build();
    const premiere = frozenQuestionOf(1, { openedAt: new Date(T0) });
    const seconde = frozenQuestionOf(2);
    sessions.add(sessionOf({ status: 'en-cours', questions: [premiere, seconde] }));
    sessions.poserReponse(reponse(premiere.id, 'p-1', true));
    sessions.poserReponse(reponse(premiere.id, 'p-2', false));
    sessions.poserReponse(reponse(seconde.id, 'p-1', true));

    await useCase.openNext({ sessionId: 'session-1' });

    expect(bus.emitted.map((e) => e.name)).toEqual(['quiz.question.closed', 'quiz.question.opened']);
    expect(bus.emitted[0]?.payload).toEqual({
      sessionId: 'session-1',
      sessionQuestionId: premiere.id,
      answerCount: 2,
      correctCount: 1,
    });
    expect(bus.emitted[1]?.payload).toEqual({
      sessionId: 'session-1',
      sessionQuestionId: seconde.id,
      rank: 2,
      timeLimitResolved: 20,
    });
  });

  // La présentation diffuse la correction de N avant d'ouvrir N+1 : sans ce
  // résultat, les téléphones ne verraient jamais la fermeture de N.
  it('rend le resultat de fermeture de la precedente', async () => {
    const { sessions, useCase } = build();
    const premiere = frozenQuestionOf(1, { openedAt: new Date(T0) });
    sessions.add(sessionOf({ status: 'en-cours', questions: [premiere, frozenQuestionOf(2)] }));
    sessions.poserReponse(reponse(premiere.id, 'p-1', true));
    sessions.poserReponse(reponse(premiere.id, 'p-2', false));

    const { ouverte, fermeturePrecedente } = await useCase.openNext({ sessionId: 'session-1' });

    expect(ouverte.rank).toBe(2);
    expect(fermeturePrecedente).toEqual({ sessionQuestionId: premiere.id, answerCount: 2, correctCount: 1 });
  });

  it('ne rend aucune fermeture quand rien n etait ouvert', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours' }));

    const { fermeturePrecedente } = await useCase.openNext({ sessionId: 'session-1' });

    expect(fermeturePrecedente).toBeNull();
  });

  it('refuse sans rien fermer quand la question ouverte est la derniere', async () => {
    const { sessions, bus, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: null })],
    }));

    await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionLeftError);

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt).toBeNull();
    expect(bus.emitted).toEqual([]);
  });

  it('refuse quand il ne reste aucune question a ouvrir', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) })],
    }));

    await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionLeftError);
  });

  it.each<SessionStatus>(['brouillon', 'ouverte', 'terminee'])(
    'refuse sur une seance %s',
    async (status) => {
      const { sessions, useCase } = build();
      sessions.add(sessionOf({ status, questions: [frozenQuestionOf(1)] }));

      await expect(useCase.openNext({ sessionId: 'session-1' })).rejects.toThrow(InvalidSessionTransitionError);
      expect((await sessions.findById('session-1'))?.questions[0]?.openedAt).toBeNull();
    });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(useCase.openNext({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });
});

describe('RunQuestionUseCase, fermeture', () => {
  it('ferme la question ouverte et rend le compte de ses reponses', async () => {
    const { sessions, bus, useCase, avancerDe } = build();
    const question = frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) });
    const autre = frozenQuestionOf(2);
    sessions.add(sessionOf({ status: 'en-cours', questions: [question, autre] }));
    sessions.poserReponse(reponse(question.id, 'p-1', true));
    sessions.poserReponse(reponse(question.id, 'p-2', false));
    sessions.poserReponse(reponse(autre.id, 'p-1', true));

    avancerDe(8_000);
    const resultat = await useCase.close({ sessionId: 'session-1' });

    expect(resultat).toEqual({ sessionQuestionId: question.id, answerCount: 2, correctCount: 1 });
    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 8_000);
    expect(bus.emitted).toEqual([{
      name: 'quiz.question.closed',
      payload: { sessionId: 'session-1', sessionQuestionId: question.id, answerCount: 2, correctCount: 1 },
    }]);
  });

  it('ferme a l echeance, pas au clic, quand l echeance est depassee depuis longtemps', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    avancerDe(60_000);
    await useCase.close({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 20_000);
  });

  /**
   * ⛔ La grace s'ajoute une seule fois, par la regle du domaine. Un `closedAt`
   * pose a `deadlineAt + GRACE_MS` la compterait deux fois.
   */
  it('ferme a l echeance un clic tombe dans la grace, qui ne s accorde qu une fois', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    avancerDe(20_200);
    await useCase.close({ sessionId: 'session-1' });

    const fermee = (await sessions.findById('session-1'))?.questions[0];
    expect(fermee?.closedAt?.getTime()).toBe(T0 + 20_000);
    const fenetre = { deadlineAt: T0 + 20_000, closedAt: fermee?.closedAt?.getTime() ?? null };
    expect(accueilDeLaReponse(fenetre, T0 + 20_100).kind).toBe('dans-la-grace');
    expect(accueilDeLaReponse(fenetre, T0 + 20_600).kind).toBe('trop-tard');
  });

  it('ferme a l instant du clic en mode controle, sans echeance', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      mode: 'controle',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: null, timeLimitResolved: null })],
    }));

    avancerDe(90_000);
    await useCase.close({ sessionId: 'session-1' });

    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 90_000);
  });

  it('refuse de fermer quand aucune question n est ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: null })],
    }));

    await expect(useCase.close({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionOpenError);
  });

  it('refuse une seconde fermeture, plutot que d ecraser l horodatage', async () => {
    const { sessions, useCase, avancerDe } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
    }));

    avancerDe(3_000);
    await useCase.close({ sessionId: 'session-1' });
    avancerDe(3_000);

    await expect(useCase.close({ sessionId: 'session-1' })).rejects.toThrow(NoQuestionOpenError);
    expect((await sessions.findById('session-1'))?.questions[0]?.closedAt?.getTime()).toBe(T0 + 3_000);
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(useCase.close({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });
});

describe('RunQuestionUseCase, question courante', () => {
  it('rend la question ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: null })],
    }));

    expect((await useCase.current({ sessionId: 'session-1' }))?.rank).toBe(1);
  });

  it('rend null quand aucune question n est ouverte', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({ status: 'en-cours', questions: [frozenQuestionOf(1)] }));

    expect(await useCase.current({ sessionId: 'session-1' })).toBeNull();
  });

  it('rend null quand la derniere ouverte a ete fermee', async () => {
    const { sessions, useCase } = build();
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) })],
    }));

    expect(await useCase.current({ sessionId: 'session-1' })).toBeNull();
  });
});

/**
 * L'ecran qui (re)joint en pleine question doit savoir quand elle finit, sans
 * comparer `deadlineAt` (horloge du SERVEUR) a l'horloge de son navigateur :
 * une horloge en avance de vingt secondes fermerait la question vingt secondes
 * trop tot pour toute la classe. Le serveur donne donc une DUREE, mesuree a
 * sa propre horloge.
 */
describe('RunQuestionUseCase, temps restant', () => {
  it('rend la duree jusqu a l echeance, mesuree a l horloge du serveur', () => {
    const { useCase } = build(T0 + 2_000);

    expect(useCase.restantMs(frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) }))).toBe(18_000);
  });

  it('rend zero quand l echeance est passee', () => {
    const { useCase } = build(T0 + 30_000);

    expect(useCase.restantMs(frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) }))).toBe(0);
  });

  it('rend null en mode controle, sans echeance', () => {
    const { useCase } = build(T0);

    expect(useCase.restantMs(frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: null }))).toBeNull();
  });
});
