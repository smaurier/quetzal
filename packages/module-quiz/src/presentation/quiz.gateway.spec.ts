import { describe, it, expect } from 'vitest';
import { rooms } from '@quetzal/core';
import { AnswerQuestionUseCase } from '../application/answer-question.use-case.js';
import { JoinSessionUseCase } from '../application/join-session.use-case.js';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import {
  FakeQuestionBankRepository,
  FakeSessionRepository,
  frozenQuestionOf,
  sessionOf,
} from '../application/testing/fake-repositories.js';
import type { AnswerRow, NewAnswer } from '../domain/ports/session.repository.js';
import { QuizBroadcaster } from './quiz.broadcaster.js';
import { QuizGateway } from './quiz.gateway.js';
import { clesProfondes, fakeServer, fauxSocket } from './testing/doublures-ws.js';

const T0 = 1_700_000_000_000;
const salle = rooms.session('quiz', 'session-1');

/** Une base qui tombe : ce que l'élève lit ne doit pas être le message technique. */
class SessionRepositoryEnPanne extends FakeSessionRepository {
  override async enregistrerReponse(_answer: NewAnswer): Promise<AnswerRow | null> {
    throw new Error('connexion Postgres perdue sur 10.0.0.3');
  }
}

function monter(options: {
  maintenant?: number;
  sessions?: FakeSessionRepository;
  casse?: (event: string) => boolean;
} = {}) {
  const sessions = options.sessions ?? new FakeSessionRepository();
  const horloge = () => options.maintenant ?? T0 + 2_000;
  const manage = new ManageSessionUseCase(sessions, new FakeQuestionBankRepository());
  const diffuseur = new QuizBroadcaster(manage, new SessionReportUseCase(sessions));
  const { emis, server } = fakeServer(options.casse === undefined ? {} : { casse: options.casse });
  const passerelle = new QuizGateway(
    new JoinSessionUseCase(sessions),
    new AnswerQuestionUseCase(sessions, horloge),
    new RunQuestionUseCase(sessions, horloge),
    manage,
    diffuseur);
  passerelle.afterInit(server);
  return { sessions, passerelle, emis };
}

/** Une séance en cours, question 1 ouverte à T0 pour vingt secondes, et deux élèves inscrits. */
async function seanceEnCours(sessions: FakeSessionRepository, question = frozenQuestionOf(1, {
  openedAt: new Date(T0),
  deadlineAt: new Date(T0 + 20_000),
})) {
  sessions.add(sessionOf({ status: 'en-cours', questions: [question, frozenQuestionOf(2)] }));
  const ana = await sessions.ajouterParticipant({
    sessionId: 'session-1', participantIndex: 1, guestId: 'g-ana', displayName: 'Ana',
  });
  const beto = await sessions.ajouterParticipant({
    sessionId: 'session-1', participantIndex: 2, guestId: 'g-beto', displayName: 'Beto',
  });
  return { question, ana, beto };
}

function socketDe(participantId: string, guestId: string) {
  return fauxSocket({ role: 'guest', guestId, sessionId: 'session-1', participantId });
}

describe('QuizGateway, answer', () => {
  // ⛔ Le participant vient de l'identité du socket, posée à la connexion. Une
  // charge qui nommerait un autre participant ne doit rien y changer.
  it('repond au nom du participant du socket, jamais de celui nomme dans la charge', async () => {
    const { sessions, passerelle } = monter();
    const { question, ana, beto } = await seanceEnCours(sessions);

    await passerelle.handleAnswer(
      { sessionQuestionId: question.id, optionId: 'o-juste-1', participantId: beto.id },
      socketDe(ana.id, 'g-ana').socket);

    const lignes = await sessions.answersFor(question.id);
    expect(lignes.map((l) => [l.participantId, l.authorGuestId])).toEqual([[ana.id, 'g-ana']]);
  });

  // ⛔ Pendant qu'une question est ouverte, rien d'une réponse ne part vers la
  // salle : ni le résultat, ni un score qui bouge, sinon chacun lit qui a juste.
  it('envoie le resultat au seul participant et rien a la salle entiere', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question, ana } = await seanceEnCours(sessions);

    await passerelle.handleAnswer(
      { sessionQuestionId: question.id, optionId: 'o-juste-1' },
      socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => [e.room, e.event])).toEqual([
      [rooms.subgroup('quiz', 'session-1', ana.id), 'answer-result'],
    ]);
    expect(emis[0]?.payload).toMatchObject({ isCorrect: true, dansLaGrace: false });
  });

  it('refuse une charge sans sessionQuestionId, sans rien ecrire', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question, ana } = await seanceEnCours(sessions);

    await passerelle.handleAnswer({ optionId: 'o-juste-1' }, socketDe(ana.id, 'g-ana').socket);

    expect(await sessions.answersFor(question.id)).toHaveLength(0);
    expect(emis).toEqual([{
      room: rooms.subgroup('quiz', 'session-1', ana.id),
      event: 'answer-refused',
      payload: { reason: 'InvalidAnswerError' },
    }]);
  });

  it('refuse une charge qui n est pas un objet', async () => {
    const { sessions, passerelle, emis } = monter();
    const { ana } = await seanceEnCours(sessions);

    await passerelle.handleAnswer('o-juste-1', socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => e.event)).toEqual(['answer-refused']);
  });

  // `Quiz_Answer.value` est `VarChar(160)` : 161 caractères finiraient en
  // erreur Postgres brute.
  it('refuse une saisie de 161 caracteres et accepte 160', async () => {
    const { sessions, passerelle, emis } = monter();
    const saisie = frozenQuestionOf(1, {
      answerMode: 'saisie', options: [], acceptedAnswers: ['hola'],
      openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000),
    });
    const { ana, beto } = await seanceEnCours(sessions, saisie);

    await passerelle.handleAnswer({ sessionQuestionId: saisie.id, value: 'a'.repeat(161) }, socketDe(ana.id, 'g-ana').socket);
    await passerelle.handleAnswer({ sessionQuestionId: saisie.id, value: 'a'.repeat(160) }, socketDe(beto.id, 'g-beto').socket);

    expect((await sessions.answersFor(saisie.id)).map((l) => l.participantId)).toEqual([beto.id]);
    expect(emis.map((e) => e.event)).toEqual(['answer-refused', 'answer-result']);
  });

  it('refuse une reponse sans proposition ni saisie', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question, ana } = await seanceEnCours(sessions);

    await passerelle.handleAnswer({ sessionQuestionId: question.id }, socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => e.payload)).toEqual([{ reason: 'InvalidAnswerError' }]);
  });

  it('diffuse un double appui comme un refus au lieu de lever', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question, ana } = await seanceEnCours(sessions);
    const { socket } = socketDe(ana.id, 'g-ana');

    await passerelle.handleAnswer({ sessionQuestionId: question.id, optionId: 'o-juste-1' }, socket);
    await passerelle.handleAnswer({ sessionQuestionId: question.id, optionId: 'o-faux-1' }, socket);

    expect(emis.map((e) => [e.event, e.payload])).toEqual([
      ['answer-result', expect.anything()],
      ['answer-refused', { reason: 'AlreadyAnsweredError' }],
    ]);
  });

  it('ne laisse jamais le message technique d une panne arriver a l eleve', async () => {
    const { sessions, passerelle, emis } = monter({ sessions: new SessionRepositoryEnPanne() });
    const { question, ana } = await seanceEnCours(sessions);

    await passerelle.handleAnswer({ sessionQuestionId: question.id, optionId: 'o-juste-1' }, socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => e.payload)).toEqual([{ reason: 'InternalError' }]);
  });

  // Tâche 12 : les comptes annoncés à la fermeture ne contiennent pas une
  // réponse arrivée dans la grâce. La salle doit les relire, à jour.
  it('rediffuse la fermeture quand une reponse de grace arrive apres elle', async () => {
    const fermee = frozenQuestionOf(1, {
      openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000), closedAt: new Date(T0 + 5_000),
    });
    const { sessions, passerelle, emis } = monter({ maintenant: T0 + 5_200 });
    const { ana } = await seanceEnCours(sessions, fermee);

    await passerelle.handleAnswer({ sessionQuestionId: fermee.id, optionId: 'o-juste-1' }, socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => [e.room, e.event])).toEqual([
      [rooms.subgroup('quiz', 'session-1', ana.id), 'answer-result'],
      [salle, 'question-closed'],
      [salle, 'session-changed'],
    ]);
    expect(emis[1]?.payload).toEqual({ sessionQuestionId: fermee.id, answerCount: 1, correctCount: 1 });
  });

  // Le résultat est déjà parti : un « refusé » derrière dirait le contraire à l'élève.
  it('n envoie jamais de refus apres un resultat, meme si la rediffusion de grace casse', async () => {
    const fermee = frozenQuestionOf(1, {
      openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000), closedAt: new Date(T0 + 5_000),
    });
    const { sessions, passerelle, emis } = monter({
      maintenant: T0 + 5_200, casse: (event) => event === 'question-closed',
    });
    const { ana } = await seanceEnCours(sessions, fermee);

    await passerelle.handleAnswer({ sessionQuestionId: fermee.id, optionId: 'o-juste-1' }, socketDe(ana.id, 'g-ana').socket);

    expect(emis.map((e) => e.event)).toContain('answer-result');
    expect(emis.map((e) => e.event)).not.toContain('answer-refused');
  });

  it('ignore un socket sans participant, celui de l animatrice', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question } = await seanceEnCours(sessions);

    await passerelle.handleAnswer(
      { sessionQuestionId: question.id, optionId: 'o-juste-1' },
      fauxSocket({ role: 'owner', userId: 'u-1', sessionId: 'session-1' }).socket);

    expect(await sessions.answersFor(question.id)).toHaveLength(0);
    expect(emis).toHaveLength(0);
  });
});

describe('QuizGateway, connexion', () => {
  it('rejoint la seance du jeton de l invite, jamais celle de la query', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    const { socket, salles } = fauxSocket(
      { role: 'guest', guestId: 'g-ana', displayName: 'Ana', sessionId: 'session-1' },
      { sessionId: 'session-autre' });

    await passerelle.handleConnection(socket);

    expect(salles).toContain(salle);
    expect(salles.some((s) => s.includes('session-autre'))).toBe(false);
  });

  it('nettoie le nom affiche de l invite avant de l inscrire', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));

    await passerelle.handleConnection(fauxSocket(
      { role: 'guest', guestId: 'g-ana', displayName: '  Ana  ', sessionId: 'session-1' }).socket);

    expect((await sessions.findById('session-1'))?.participants[0]?.memberNames).toEqual(['Ana']);
  });

  // Le jeton borne le nom à 32 sans le nettoyer : un nom fait d'espaces y passe.
  it('refuse un nom fait d espaces, sans inscrire personne', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    const { socket, emis, etat } = fauxSocket(
      { role: 'guest', guestId: 'g-ana', displayName: '    ', sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    expect(emis).toEqual([{ event: 'join-failed', payload: { reason: 'InvalidDisplayName' } }]);
    expect(etat.coupe).toBe(true);
    expect((await sessions.findById('session-1'))?.participants).toHaveLength(0);
  });

  // ⛔ L'état initial part au téléphone de l'élève qui (re)joint en pleine
  // question : la même exigence que question-opened.
  it('envoie a l invite un etat dont la question ne porte pas la reponse', async () => {
    const { sessions, passerelle } = monter();
    const saisie = frozenQuestionOf(1, {
      answerMode: 'saisie', options: [], acceptedAnswers: ['murciélago-secreto'],
      openedAt: new Date(T0), deadlineAt: new Date(T0 + 20_000),
    });
    await seanceEnCours(sessions, saisie);
    const { socket, emis, salles } = fauxSocket(
      { role: 'guest', guestId: 'g-ana', displayName: 'Ana', sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    const state = emis.find((e) => e.event === 'state')?.payload;
    expect(state).toMatchObject({ question: { sessionQuestionId: saisie.id, answerMode: 'saisie' } });
    expect(JSON.stringify(state)).not.toContain('murciélago-secreto');
    expect(clesProfondes(state).has('isCorrect')).toBe(false);
    expect(clesProfondes(state).has('acceptedAnswers')).toBe(false);
    // L'invité retrouve sa place (reconnexion) et sa sous-salle.
    const participantId = (state as { participantId: string }).participantId;
    expect(salles).toContain(rooms.subgroup('quiz', 'session-1', participantId));
  });

  // ⛔ La reconnexion en pleine question est le cas courant sur le wifi d'un
  // établissement : l'état et la diffusion qu'elle déclenche ne doivent pas
  // dire qui a déjà répondu juste.
  it('montre a qui rejoint en pleine question les scores d avant cette question', async () => {
    const { sessions, passerelle, emis } = monter();
    const { question, ana } = await seanceEnCours(sessions);
    await passerelle.handleAnswer({ sessionQuestionId: question.id, optionId: 'o-juste-1' }, socketDe(ana.id, 'g-ana').socket);
    const scoreEnBase = (await sessions.findById('session-1'))?.participants.find((p) => p.id === ana.id)?.score;
    expect(scoreEnBase).toBeGreaterThan(0);
    const carla = fauxSocket({ role: 'guest', guestId: 'g-carla', displayName: 'Carla', sessionId: 'session-1' });

    await passerelle.handleConnection(carla.socket);

    const scoreDAna = (charge: unknown) =>
      (charge as { participants: { id: string; score: number }[] }).participants.find((p) => p.id === ana.id)?.score;
    const state = carla.emis.find((e) => e.event === 'state')?.payload as { session: unknown };
    expect(scoreDAna(state.session)).toBe(0);
    const diffusion = emis.find((e) => e.room === salle && e.event === 'session-changed');
    expect(scoreDAna(diffusion?.payload)).toBe(0);
  });

  // ⛔ Les salles ne portent pas le locataire : rejoindre avant la lecture
  // cloisonnée laisserait un autre locataire écouter jusqu'à l'échec.
  it('ne rejoint aucune salle pour une seance introuvable, celle d un autre locataire', async () => {
    const { passerelle } = monter();
    const { socket, salles, emis, etat } = fauxSocket({ role: 'owner', userId: 'u-1' }, { sessionId: 'ailleurs' });

    await passerelle.handleConnection(socket);

    expect(salles).toEqual([]);
    expect(emis).toEqual([{ event: 'join-failed', payload: { reason: 'SessionNotFoundError' } }]);
    expect(etat.coupe).toBe(true);
  });

  // Le piège documenté par l'adaptateur de la plateforme : le rôle d'un
  // utilisateur est un QuetzalRole, qui contient 'guest'. Seul `guestId`
  // désigne l'identité invitée.
  it('traite en utilisateur une identite sans guestId, meme de role guest', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    const { socket, salles, etat } = fauxSocket({ role: 'guest', userId: 'u-1' }, { sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    expect(etat.coupe).toBe(false);
    expect(salles).toEqual([salle]);
  });

  // ⛔ Une DUREE et non l'echeance : l'ecran ne compare plus l'horloge du
  // serveur a la sienne (une horloge en avance fermerait trop tot).
  it('donne dans l etat le temps restant de la question ouverte, a l horloge du serveur', async () => {
    const { sessions, passerelle } = monter({ maintenant: T0 + 2_000 });
    await seanceEnCours(sessions);
    const { socket, emis } = fauxSocket({ role: 'owner', userId: 'u-1' }, { sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    expect(emis.find((e) => e.event === 'state')?.payload).toMatchObject({ restantMs: 18_000 });
  });

  it('donne un temps restant nul quand aucune question n est ouverte', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    const { socket, emis } = fauxSocket({ role: 'owner', userId: 'u-1' }, { sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    expect(emis.find((e) => e.event === 'state')?.payload).toMatchObject({ question: null, restantMs: null });
  });

  it('donne le code d entree dans l etat, comme session-changed', async () => {
    const { sessions, passerelle } = monter();
    sessions.add(sessionOf({ status: 'ouverte' }));
    const { socket, emis } = fauxSocket({ role: 'owner', userId: 'u-1' }, { sessionId: 'session-1' });

    await passerelle.handleConnection(socket);

    expect(emis.find((e) => e.event === 'state')?.payload).toMatchObject({ session: { joinCode: 'ABCD1234' } });
  });

  it('coupe une connexion d animatrice sans identifiant de seance', async () => {
    const { passerelle } = monter();
    const { socket, etat } = fauxSocket({ role: 'owner', userId: 'u-1' });

    await passerelle.handleConnection(socket);

    expect(etat.coupe).toBe(true);
  });
});

describe('QuizGateway, attachement', () => {
  // Issue #34 du loto : le serveur arrive à l'initialisation, avant toute connexion.
  it('donne le serveur au diffuseur des l initialisation', async () => {
    const sessions = new FakeSessionRepository();
    const diffuseur = new QuizBroadcaster(
      new ManageSessionUseCase(sessions, new FakeQuestionBankRepository()),
      new SessionReportUseCase(sessions));
    const passerelle = new QuizGateway(
      new JoinSessionUseCase(sessions),
      new AnswerQuestionUseCase(sessions, () => T0),
      new RunQuestionUseCase(sessions, () => T0),
      new ManageSessionUseCase(sessions, new FakeQuestionBankRepository()),
      diffuseur);
    const { emis, server } = fakeServer();

    passerelle.afterInit(server);
    await diffuseur.questionOpened('session-1', frozenQuestionOf(1));

    expect(emis).toHaveLength(1);
  });
});
