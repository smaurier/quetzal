import { describe, it, expect } from 'vitest';
import { rooms } from '@quetzal/core';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import {
  FakeQuestionBankRepository,
  FakeSessionRepository,
  frozenQuestionOf,
  sessionOf,
} from '../application/testing/fake-repositories.js';
import { QuizBroadcaster } from './quiz.broadcaster.js';
import { clesProfondes, fakeServer } from './testing/doublures-ws.js';

const T0 = 1_700_000_000_000;

function monter() {
  const sessions = new FakeSessionRepository();
  const diffuseur = new QuizBroadcaster(
    new ManageSessionUseCase(sessions, new FakeQuestionBankRepository()),
    new SessionReportUseCase(sessions));
  const { emis, server } = fakeServer();
  diffuseur.attach(server);
  return { sessions, diffuseur, emis };
}

const salle = rooms.session('quiz', 'session-1');

describe('QuizBroadcaster, question-opened', () => {
  // ⛔ Le garde le plus important du module : cette charge part vers les
  // téléphones des élèves. Une bonne réponse dedans se lit dans l'onglet réseau.
  it('ne porte ni isCorrect ni acceptedAnswers, a aucune profondeur', async () => {
    const { diffuseur, emis } = monter();
    const choix = frozenQuestionOf(1, { openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) });

    await diffuseur.questionOpened('session-1', choix);

    expect(emis).toHaveLength(1);
    expect(emis[0]?.room).toBe(salle);
    expect(emis[0]?.event).toBe('question-opened');
    const cles = clesProfondes(emis[0]?.payload);
    expect(cles.has('isCorrect')).toBe(false);
    expect(cles.has('acceptedAnswers')).toBe(false);
    // Ce que l'élève doit pouvoir faire reste là : désigner une proposition.
    expect(emis[0]?.payload).toMatchObject({
      sessionQuestionId: choix.id,
      rank: 1,
      prompt: 'Question 1',
      deadlineAt: new Date(T0 + 20_000).toISOString(),
      options: [
        { id: 'o-juste-1', rank: 1, label: 'Juste' },
        { id: 'o-faux-1', rank: 2, label: 'Faux' },
      ],
    });
  });

  it('ne laisse aucune reponse acceptee d une saisie dans la charge, meme sous un autre nom', async () => {
    const { diffuseur, emis } = monter();
    const saisie = frozenQuestionOf(2, {
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: ['murciélago-secreto'],
      openedAt: new Date(T0),
    });

    await diffuseur.questionOpened('session-1', saisie);

    expect(JSON.stringify(emis[0]?.payload)).not.toContain('murciélago-secreto');
    expect(emis[0]?.payload).toMatchObject({ answerMode: 'saisie', options: [] });
  });
});

describe('QuizBroadcaster, session-changed', () => {
  it('diffuse les participants a la salle sans aucune donnee de reponse', async () => {
    const { sessions, diffuseur, emis } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    await sessions.ajouterParticipant({
      sessionId: 'session-1', participantIndex: 1, guestId: 'g-1', displayName: 'Ana',
    });

    await diffuseur.sessionChanged('session-1');

    expect(emis).toHaveLength(1);
    expect(emis[0]?.room).toBe(salle);
    expect(emis[0]?.event).toBe('session-changed');
    expect(emis[0]?.payload).toMatchObject({
      id: 'session-1',
      status: 'ouverte',
      questionCount: 2,
      participants: [{ participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    });
    const cles = clesProfondes(emis[0]?.payload);
    for (const interdite of ['isCorrect', 'acceptedAnswers', 'questions', 'guestId', 'authorGuestId']) {
      expect(cles.has(interdite), interdite).toBe(false);
    }
  });
});

describe('QuizBroadcaster, question-closed', () => {
  it('annonce les comptes puis remet la salle a jour', async () => {
    const { sessions, diffuseur, emis } = monter();
    sessions.add(sessionOf({ status: 'en-cours' }));
    const resultat = { sessionQuestionId: 'sq-1', answerCount: 3, correctCount: 2 };

    await diffuseur.questionClosed('session-1', resultat);

    expect(emis.map((e) => [e.room, e.event])).toEqual([
      [salle, 'question-closed'],
      [salle, 'session-changed'],
    ]);
    expect(emis[0]?.payload).toEqual(resultat);
  });
});

describe('QuizBroadcaster, session-finished', () => {
  // Le podium part à toute la salle. Le détail juste / faux / absent de chaque
  // élève est le retour d'Elda, lu sur SA route, pas sur le téléphone du voisin.
  it('ne diffuse que le rang, le nom et le score de chacun', async () => {
    const { sessions, diffuseur, emis } = monter();
    sessions.add(sessionOf({
      status: 'terminee',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 5_000) })],
    }));
    const ana = await sessions.ajouterParticipant({
      sessionId: 'session-1', participantIndex: 1, guestId: 'g-1', displayName: 'Ana',
    });

    await diffuseur.sessionFinished('session-1');

    expect(emis).toHaveLength(1);
    expect(emis[0]?.room).toBe(salle);
    expect(emis[0]?.event).toBe('session-finished');
    expect(emis[0]?.payload).toEqual({
      questionCount: 1,
      classement: [{ participantId: ana.id, label: 'Ana', score: 0 }],
    });
  });
});

describe('QuizBroadcaster, vers un seul participant', () => {
  it('envoie le resultat d une reponse au seul participant, jamais a la salle', () => {
    const { diffuseur, emis } = monter();

    diffuseur.answerAcknowledged('session-1', 'p-1', { isCorrect: true, points: 1200, dansLaGrace: false });

    expect(emis).toEqual([{
      room: rooms.subgroup('quiz', 'session-1', 'p-1'),
      event: 'answer-result',
      payload: { isCorrect: true, points: 1200, dansLaGrace: false },
    }]);
  });

  it('envoie un refus au seul participant', () => {
    const { diffuseur, emis } = monter();

    diffuseur.answerRefused('session-1', 'p-1', 'AlreadyAnsweredError');

    expect(emis).toEqual([{
      room: rooms.subgroup('quiz', 'session-1', 'p-1'),
      event: 'answer-refused',
      payload: { reason: 'AlreadyAnsweredError' },
    }]);
  });
});

describe('QuizBroadcaster, sans serveur', () => {
  // Issue #34 du loto : la commande HTTP est déjà persistée quand la diffusion
  // part, lever ici rendrait un 500 sur une opération réussie.
  it('n emet rien et ne leve pas quand le serveur n est pas attache', async () => {
    const sessions = new FakeSessionRepository();
    const diffuseur = new QuizBroadcaster(
      new ManageSessionUseCase(sessions, new FakeQuestionBankRepository()),
      new SessionReportUseCase(sessions));

    await expect(diffuseur.questionOpened('session-1', frozenQuestionOf(1))).resolves.toBeUndefined();
  });
});
