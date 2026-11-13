import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ManageSessionUseCase } from '../application/manage-session.use-case.js';
import { RunQuestionUseCase } from '../application/run-question.use-case.js';
import { FinishSessionUseCase } from '../application/finish-session.use-case.js';
import { SessionReportUseCase } from '../application/session-report.use-case.js';
import {
  FakeQuestionBankRepository,
  FakeSessionRepository,
  bankOf,
  frozenQuestionOf,
  sessionOf,
} from '../application/testing/fake-repositories.js';
import { SessionController } from './session.controller.js';

const T0 = 1_700_000_000_000;

/**
 * Par une VRAIE application Nest, et non en appelant les méthodes : ce qui est
 * prouvé ici est que le filtre est branché sur le contrôleur. Un filtre juste
 * mais oublié dans `@UseFilters` laisserait le filtre global répondre 400.
 */
describe('SessionController, par HTTP', () => {
  let app: INestApplication;
  let base: string;
  let sessions: FakeSessionRepository;
  let banques: FakeQuestionBankRepository;

  beforeEach(async () => {
    sessions = new FakeSessionRepository();
    banques = new FakeQuestionBankRepository();
    const horloge = () => T0;
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        { provide: ManageSessionUseCase, useValue: new ManageSessionUseCase(sessions, banques) },
        { provide: RunQuestionUseCase, useValue: new RunQuestionUseCase(sessions, horloge) },
        { provide: FinishSessionUseCase, useValue: new FinishSessionUseCase(sessions, horloge) },
        { provide: SessionReportUseCase, useValue: new SessionReportUseCase(sessions) },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/modules/quiz/sessions`;
  });

  afterEach(async () => {
    await app.close();
  });

  async function appel(methode: string, chemin: string, body?: unknown) {
    const res = await fetch(`${base}${chemin}`, {
      method: methode,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as { error?: string } };
  }

  it('repond 404 a une seance inconnue', async () => {
    const r = await appel('GET', '/inconnue');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('session_not_found_error');
  });

  it('repond 404 quand on pilote une seance inconnue', async () => {
    expect((await appel('POST', '/inconnue/open')).status).toBe(404);
  });

  it('repond 409 a une transition refusee', async () => {
    sessions.add(sessionOf({ status: 'terminee' }));
    const r = await appel('POST', '/session-1/open');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('invalid_session_transition_error');
  });

  it('repond 409 empty_bank_error au demarrage sur une banque vide', async () => {
    banques.add(bankOf(0));
    sessions.add(sessionOf({ status: 'ouverte', questions: [] }));
    const r = await appel('POST', '/session-1/start');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('empty_bank_error');
  });

  it('repond 409 session_bank_deleted_error quand la banque a ete supprimee', async () => {
    sessions.add(sessionOf({ status: 'ouverte', deckId: null, questions: [] }));
    const r = await appel('POST', '/session-1/start');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('session_bank_deleted_error');
  });

  it('repond 409 no_question_left_error quand tout a ete joue', async () => {
    sessions.add(sessionOf({
      status: 'en-cours',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0 - 9_000), closedAt: new Date(T0 - 1_000) })],
    }));
    const r = await appel('POST', '/session-1/questions/next');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('no_question_left_error');
  });

  it('repond 409 no_question_open_error quand on ferme sans question ouverte', async () => {
    sessions.add(sessionOf({ status: 'en-cours' }));
    const r = await appel('POST', '/session-1/questions/close');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('no_question_open_error');
  });

  it('ouvre la question suivante a l heure de l horloge fournie', async () => {
    sessions.add(sessionOf({ status: 'en-cours' }));
    const r = await appel('POST', '/session-1/questions/next');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ rank: 1, deadlineAt: new Date(T0 + 20_000).toISOString() });
  });

  it('repond 400 a un nom de participant de 41 caracteres, avant la base', async () => {
    sessions.add(sessionOf());
    expect((await appel('PATCH', '/session-1/participants/p-1', { name: 'a'.repeat(41) })).status).toBe(400);
  });

  it('repond 404 au renommage d un participant d une autre seance', async () => {
    sessions.add(sessionOf({ id: 'session-1', joinCode: 'AAAA2222' }));
    sessions.add(sessionOf({ id: 'session-2', joinCode: 'BBBB3333' }));
    const ailleurs = await sessions.ajouterParticipant({
      sessionId: 'session-2', participantIndex: 1, guestId: 'g-2', displayName: 'Bea',
    });
    const r = await appel('PATCH', `/session-1/participants/${ailleurs.id}`, { name: 'Intrus' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('participant_not_found_error');
  });

  it('repond 400 a un defi cree sans delai par defaut', async () => {
    const r = await appel('POST', '', {
      deckId: 'bank-1', mode: 'defi', maxParticipants: 30, defaultTimeLimit: null,
    });
    expect(r.status).toBe(400);
  });

  /** Décision de la tâche 14 : le retour se lit aussi en cours de séance. */
  it('rend le retour d une seance encore en cours', async () => {
    sessions.add(sessionOf({ status: 'en-cours' }));
    expect((await appel('GET', '/session-1/report')).status).toBe(200);
  });
});
