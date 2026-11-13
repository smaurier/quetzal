import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { BASE, BONUS_MAX, GRACE_MS } from '../domain/scoring.js';
import {
  AlreadyAnsweredError,
  AnswerTooLateError,
  InvalidAnswerError,
  NoQuestionOpenError,
  ParticipantNotFoundError,
  QuestionNotFoundError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { FrozenQuestion, Session } from '../domain/ports/session.repository.js';
import { AnswerQuestionUseCase } from './answer-question.use-case.js';
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

const DEUX_PARTICIPANTS = [
  { id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] },
  { id: 'p-2', participantIndex: 2, name: null, score: 0, memberNames: ['Bea'] },
];

function q1Ouverte(overrides: Partial<FrozenQuestion> = {}): FrozenQuestion {
  return frozenQuestionOf(1, {
    id: 'sq-1',
    openedAt: new Date(T0),
    deadlineAt: new Date(T0 + 20_000),
    timeLimitResolved: 20,
    ...overrides,
  });
}

function build(
  questions: readonly FrozenQuestion[] = [q1Ouverte()],
  session: Partial<Session> = {}) {
  const sessions = new FakeSessionRepository();
  const bus = new RecordingBus();
  let horloge = T0;
  sessions.add(sessionOf({
    status: 'en-cours',
    questions,
    participants: DEUX_PARTICIPANTS,
    ...session,
  }));
  const useCase = new AnswerQuestionUseCase(sessions, () => horloge, bus);
  return {
    sessions,
    bus,
    useCase,
    avancerDe: (ms: number) => { horloge += ms; },
    reponses: () => sessions.allAnswers('session-1'),
    scoreDe: async (participantId: string) =>
      (await sessions.findById('session-1'))?.participants.find((p) => p.id === participantId)?.score,
  };
}

const ANA = { sessionId: 'session-1', sessionQuestionId: 'sq-1', participantId: 'p-1', guestId: 'g-1' };

describe('AnswerQuestionUseCase, mode defi', () => {
  it('accepte une proposition juste et rend le bonus plein a l instant zero', async () => {
    const { useCase, scoreDe } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.isCorrect).toBe(true);
    expect(r.points).toBe(BASE + BONUS_MAX);
    expect(await scoreDe('p-1')).toBe(BASE + BONUS_MAX);
  });

  it('accepte une proposition fausse, et elle vaut zero', async () => {
    const { useCase, scoreDe } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-faux-1' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
    expect(await scoreDe('p-1')).toBe(0);
  });

  it('decroit le bonus avec le temps', async () => {
    const { useCase, avancerDe } = build();
    avancerDe(10_000);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(BASE + Math.round(BONUS_MAX / 2));
  });

  /**
   * ⛔ LA GRACE, bout en bout : acceptee, et sans bonus. C'est la rencontre de
   * la regle de fermeture (D8) et du bareme (D7 propriete 3).
   */
  it('accepte dans la grace, et la paie BASE sans bonus', async () => {
    const { useCase, avancerDe, scoreDe } = build();
    avancerDe(20_000 + GRACE_MS - 1);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(BASE);
    expect(r.dansLaGrace).toBe(true);
    expect(await scoreDe('p-1')).toBe(BASE);
  });

  it('refuse apres la grace, sans rien ecrire', async () => {
    const { useCase, avancerDe, reponses, scoreDe } = build();
    avancerDe(20_000 + GRACE_MS + 1);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AnswerTooLateError);
    // Une reponse refusee mais ecrite apparaitrait dans le retour de seance.
    expect(await reponses()).toHaveLength(0);
    expect(await scoreDe('p-1')).toBe(0);
  });

  it('refuse apres une fermeture manuelle passee la grace, meme avant l echeance', async () => {
    const { useCase, avancerDe } = build([q1Ouverte({ closedAt: new Date(T0 + 4_000) })]);
    avancerDe(4_000 + GRACE_MS + 1);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AnswerTooLateError);
  });

  /**
   * ⛔ La grace compte depuis la fermeture EFFECTIVE (regle 4b) : D8 fait fermer
   * le navigateur de l'animatrice a zero, donc la fermeture manuelle est le
   * chemin normal. Sans ca, une selection engagee au clic serait perdue.
   */
  it('accepte dans la grace d une fermeture manuelle, BASE sans bonus', async () => {
    const { useCase, avancerDe } = build([q1Ouverte({ closedAt: new Date(T0 + 4_000) })]);
    avancerDe(4_000 + GRACE_MS - 1);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.dansLaGrace).toBe(true);
    expect(r.points).toBe(BASE);
  });

  /**
   * ⛔ « Question suivante » ferme N et ouvre N+1 dans le meme geste. Une reponse
   * de grace pour N arrive donc pendant que N+1 est ouverte : c'est la
   * question NOMMEE par l'eleve qui fait foi, jamais « celle qui est ouverte ».
   */
  it('juge une reponse de grace sur la question nommee, meme quand la suivante est ouverte', async () => {
    const { useCase, avancerDe, reponses } = build([
      q1Ouverte({ closedAt: new Date(T0 + 4_000) }),
      frozenQuestionOf(2, { id: 'sq-2', openedAt: new Date(T0 + 4_000), deadlineAt: new Date(T0 + 24_000) }),
    ]);
    avancerDe(4_200);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.sessionQuestionId).toBe('sq-1');
    expect(r.isCorrect).toBe(true);
    expect(r.points).toBe(BASE);
    expect((await reponses())[0]?.sessionQuestionId).toBe('sq-1');
  });

  /**
   * ⛔ COMPTES ET GRACE. La fermeture a annonce ses comptes au clic ; une reponse
   * acceptee ensuite dans la grace n'y figure pas. Le cas d'usage rend donc les
   * comptes RECALCULES, pour que la presentation les rediffuse.
   */
  it('rend les comptes recalcules quand une reponse de grace arrive sur une question fermee', async () => {
    const { useCase, avancerDe, sessions } = build([q1Ouverte({ closedAt: new Date(T0 + 4_000) })]);
    sessions.poserReponse({
      sessionQuestionId: 'sq-1', participantId: 'p-2', authorGuestId: 'g-2',
      optionId: 'o-faux-1', value: null, isCorrect: false, elapsedMs: 1_000, points: 0,
    });
    avancerDe(4_100);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.fermetureMiseAJour).toEqual({
      sessionQuestionId: 'sq-1',
      answerCount: 2,
      correctCount: 1,
    });
  });

  it('ne rend aucun compte recalcule tant que la question n est pas fermee', async () => {
    const { useCase, avancerDe } = build();
    avancerDe(20_000 + GRACE_MS - 1);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.dansLaGrace).toBe(true);
    expect(r.fermetureMiseAJour).toBeNull();
  });

  /**
   * ⛔ ON REPOND UNE FOIS. Deux doigts sur un telephone d'eleve suffisent a
   * declencher deux emissions.
   */
  it('refuse une seconde reponse du meme participant, sans doubler son score', async () => {
    const { useCase, reponses, scoreDe } = build();

    const premiere = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });
    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(
      AlreadyAnsweredError);

    expect(await scoreDe('p-1')).toBe(premiere.points);
    expect(await reponses()).toHaveLength(1);
  });

  it('laisse un AUTRE participant repondre a la meme question', async () => {
    const { useCase, reponses } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });
    await useCase.execute({
      sessionId: 'session-1', sessionQuestionId: 'sq-1', participantId: 'p-2', guestId: 'g-2', optionId: 'o-faux-1',
    });

    expect(await reponses()).toHaveLength(2);
  });

  it('enregistre le temps ecoule, meme quand la reponse est fausse', async () => {
    const { useCase, reponses, avancerDe } = build();
    avancerDe(3_400);

    await useCase.execute({ ...ANA, optionId: 'o-faux-1' });

    expect((await reponses())[0]?.elapsedMs).toBe(3_400);
  });

  /**
   * ⛔ L'AUTEUR est garde meme quand l'unite de score est l'equipe (D4) : c'est
   * ce qui rend le retour de seance nominatif.
   */
  it('garde le guestId de l auteur sur la reponse', async () => {
    const { useCase, reponses } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect((await reponses())[0]?.authorGuestId).toBe('g-1');
  });

  it('ecrit la proposition envoyee, et aucune valeur quand le client n en envoie pas', async () => {
    const { useCase, reponses } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect((await reponses())[0]).toMatchObject({ optionId: 'o-juste-1', value: null, isCorrect: true });
  });

  /**
   * ⛔ D5 : l'instant d'arrivee est mesure par le SERVEUR. Un client qui
   * affirmerait avoir repondu plus tot ne gagne rien.
   */
  it('mesure l arrivee a l horloge du serveur, jamais a celle du client', async () => {
    const { useCase, avancerDe } = build();
    avancerDe(10_000);
    const avecHeureDuClient = { ...ANA, optionId: 'o-juste-1', arriveeMs: T0, answeredAt: new Date(T0) };

    const r = await useCase.execute(avecHeureDuClient);

    expect(r.elapsedMs).toBe(10_000);
    expect(r.points).toBe(BASE + Math.round(BONUS_MAX / 2));
  });

  it('emet quiz.answer.recorded apres l ecriture', async () => {
    const { useCase, bus } = build();

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(bus.emitted).toEqual([{
      name: 'quiz.answer.recorded',
      payload: {
        sessionId: 'session-1',
        sessionQuestionId: 'sq-1',
        participantId: 'p-1',
        isCorrect: true,
        points: BASE + BONUS_MAX,
      },
    }]);
  });

  it('n emet rien sur un refus', async () => {
    const { useCase, bus, avancerDe } = build();
    avancerDe(60_000);

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(AnswerTooLateError);

    expect(bus.emitted).toEqual([]);
  });
});

describe('AnswerQuestionUseCase, recevabilite', () => {
  /**
   * ⛔ D5 : le serveur ne tient AUCUN compte de ce que le client affirme sur sa
   * propre justesse. Envoyer l'identifiant d'une proposition qui n'existe pas
   * est faux, jamais une erreur a exploiter.
   */
  it('traite un identifiant de proposition inconnu comme FAUX, et non comme une panne', async () => {
    const { useCase } = build();

    const r = await useCase.execute({ ...ANA, optionId: 'o-inventee' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
  });

  it('traite une saisie envoyee a une question a choix comme fausse', async () => {
    const { useCase } = build();

    const r = await useCase.execute({ ...ANA, value: 'la silla' });

    expect(r.isCorrect).toBe(false);
  });

  /**
   * Faux, donc ecrit, compte et emis comme toute reponse : l'unique reponse de
   * l'eleve est consommee, et elle figure au retour de seance.
   */
  it('ecrit, emet et consomme une proposition inconnue, comptee fausse', async () => {
    const { useCase, reponses, bus, scoreDe } = build();

    await useCase.execute({ ...ANA, optionId: 'o-inventee' });

    expect(await reponses()).toEqual([
      expect.objectContaining({ optionId: 'o-inventee', value: null, isCorrect: false, points: 0 }),
    ]);
    expect(bus.emitted.map((e) => e.name)).toEqual(['quiz.answer.recorded']);
    expect(await scoreDe('p-1')).toBe(0);
    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(AlreadyAnsweredError);
  });

  it('compte fausse une proposition d une AUTRE question de la seance', async () => {
    const { useCase } = build([q1Ouverte(), frozenQuestionOf(2, { id: 'sq-2' })]);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-2' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
  });

  it('ecrit la saisie envoyee a une question a choix, telle qu envoyee', async () => {
    const { useCase, reponses } = build();

    await useCase.execute({ ...ANA, value: 'la silla' });

    expect((await reponses())[0]).toMatchObject({ optionId: null, value: 'la silla', isCorrect: false });
  });

  /**
   * ⛔ La seule reponse REFUSEE pour sa forme : sans proposition ni saisie, la
   * ligne violerait `Quiz_Answer_option_ou_valeur_check` en base.
   */
  it('refuse une reponse sans proposition ni saisie, sans rien ecrire', async () => {
    const { useCase, reponses } = build();

    await expect(useCase.execute({ ...ANA })).rejects.toThrow(InvalidAnswerError);
    expect(await reponses()).toHaveLength(0);
  });

  it('refuse quand la question nommee n est pas encore ouverte', async () => {
    const { useCase } = build([q1Ouverte(), frozenQuestionOf(2, { id: 'sq-2' })]);

    await expect(
      useCase.execute({ ...ANA, sessionQuestionId: 'sq-2', optionId: 'o-juste-2' })).rejects.toThrow(
      NoQuestionOpenError);
  });

  it('refuse une question qui n appartient pas a cette seance', async () => {
    const { useCase, sessions, reponses } = build();
    sessions.add(sessionOf({
      id: 'session-2',
      joinCode: 'ZZZZ9999',
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { id: 'sq-autre', openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000) })],
      participants: [],
    }));

    await expect(
      useCase.execute({ ...ANA, sessionQuestionId: 'sq-autre', optionId: 'o-juste-1' })).rejects.toThrow(
      QuestionNotFoundError);
    expect(await reponses()).toHaveLength(0);
  });

  it('refuse un participant d une AUTRE seance, sans rien ecrire', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({
      id: 'session-2',
      joinCode: 'ZZZZ9999',
      status: 'en-cours',
      questions: [],
      participants: [{ id: 'p-9', participantIndex: 1, name: null, score: 0, memberNames: ['Zoe'] }],
    }));

    await expect(
      useCase.execute({ ...ANA, participantId: 'p-9', optionId: 'o-juste-1' })).rejects.toThrow(
      ParticipantNotFoundError);
    expect(await sessions.answersFor('sq-1')).toHaveLength(0);
    expect((await sessions.findById('session-2'))?.participants[0]?.score).toBe(0);
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ ...ANA, sessionId: 'session-x', optionId: 'o-juste-1' })).rejects.toThrow(
      SessionNotFoundError);
  });

  it('refuse sur une seance qui n est pas en cours', async () => {
    const { useCase } = build([q1Ouverte()], { status: 'terminee' });

    await expect(useCase.execute({ ...ANA, optionId: 'o-juste-1' })).rejects.toThrow(NoQuestionOpenError);
  });
});

describe('AnswerQuestionUseCase, mode controle', () => {
  function enControle(questions: readonly FrozenQuestion[] = [
    q1Ouverte({ deadlineAt: null, timeLimitResolved: null }),
  ]) {
    return build(questions, { mode: 'controle' });
  }

  it('paie un point pour une reponse juste, et rien de plus', async () => {
    const { useCase } = enControle();

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(1);
  });

  /**
   * ⛔ Aucune pression de vitesse (D6) : une reponse apres trois minutes vaut
   * exactement la meme chose qu'une reponse immediate.
   */
  it('paie pareil apres trois minutes, puisqu il n y a aucun minuteur', async () => {
    const { useCase, avancerDe } = enControle();
    avancerDe(180_000);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.points).toBe(1);
    expect(r.dansLaGrace).toBe(false);
  });

  it('paie le point fixe dans la grace d une fermeture manuelle', async () => {
    const { useCase, avancerDe } = enControle([
      q1Ouverte({ deadlineAt: null, timeLimitResolved: null, closedAt: new Date(T0 + 30_000) }),
    ]);
    avancerDe(30_000 + GRACE_MS - 1);

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.dansLaGrace).toBe(true);
    expect(r.points).toBe(1);
  });

  it('enregistre tout de meme le temps, pour le retour de seance', async () => {
    const { useCase, reponses, avancerDe } = enControle();
    avancerDe(42_000);

    await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect((await reponses())[0]?.elapsedMs).toBe(42_000);
  });
});

describe('AnswerQuestionUseCase, mode saisie', () => {
  function enSaisie(regles = { accentsSensibles: false, casseSensible: false }) {
    return build([q1Ouverte({
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: ['la casa', 'el hogar'],
      regles,
    })]);
  }

  it('accepte une variante listee', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: 'el hogar' })).isCorrect).toBe(true);
  });

  it('applique les drapeaux tolerants de la question FIGEE', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: '  LA  CÁSA ' })).isCorrect).toBe(true);
  });

  it('applique les accents sensibles de la question FIGEE', async () => {
    const { useCase } = enSaisie({ accentsSensibles: true, casseSensible: false });
    expect((await useCase.execute({ ...ANA, value: 'la cása' })).isCorrect).toBe(false);
  });

  it('applique la casse sensible de la question FIGEE', async () => {
    const { useCase } = enSaisie({ accentsSensibles: false, casseSensible: true });
    expect((await useCase.execute({ ...ANA, value: 'La Casa' })).isCorrect).toBe(false);
  });

  it('refuse un mot different, compte faux', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: 'la cosa' })).isCorrect).toBe(false);
  });

  it('ecrit la valeur saisie telle quelle', async () => {
    const { useCase, reponses } = enSaisie();

    await useCase.execute({ ...ANA, value: 'el hogar' });

    expect((await reponses())[0]).toMatchObject({ optionId: null, value: 'el hogar' });
  });

  it('refuse une saisie vide, sans lever', async () => {
    const { useCase } = enSaisie();
    expect((await useCase.execute({ ...ANA, value: '   ' })).isCorrect).toBe(false);
  });

  it('compte fausse une saisie vide, et l ecrit', async () => {
    const { useCase, reponses } = enSaisie();

    const r = await useCase.execute({ ...ANA, value: '' });

    expect(r.isCorrect).toBe(false);
    expect((await reponses())[0]).toMatchObject({ value: '', isCorrect: false, points: 0 });
  });

  it('compte fausse une proposition envoyee a une question en saisie', async () => {
    const { useCase } = enSaisie();

    const r = await useCase.execute({ ...ANA, optionId: 'o-juste-1' });

    expect(r.isCorrect).toBe(false);
    expect(r.points).toBe(0);
  });
});
