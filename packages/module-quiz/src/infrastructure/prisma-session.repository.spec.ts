import { describe, it, expect } from 'vitest';
import { Prisma } from '@quetzal/db';
import { InvalidQuestionShapeError, SessionNotFoundError } from '../domain/errors.js';
import { lireSession, manqueLeParticipant, violeLUnicite, type LigneSession } from './prisma-session.repository.js';

const ligne = (overrides: Partial<LigneSession> = {}): LigneSession => ({
  id: 's-1',
  deckId: 'b-1',
  mode: 'defi',
  status: 'ouverte',
  maxParticipants: 6,
  joinCode: 'ABCD1234',
  defaultTimeLimit: 20,
  guestLocale: null,
  questions: [],
  participants: [],
  ...overrides,
});

const violation = (code: string, target: unknown) =>
  new Prisma.PrismaClientKnownRequestError('violation', { code, clientVersion: 'test', meta: { target } });

/**
 * La CHECK de la base precede ces gardes : une vraie base ne peut pas porter de
 * valeur inconnue, donc ils ne se prouvent qu'ici. Ils restent le dernier
 * rempart si la base et le code se desynchronisent.
 */
describe('lireSession', () => {
  it('leve une erreur de domaine sur un statut inconnu', () => {
    expect(() => lireSession(ligne({ status: 'archivee' }))).toThrow(SessionNotFoundError);
  });

  it('leve une erreur de domaine sur un mode inconnu', () => {
    expect(() => lireSession(ligne({ mode: 'tournoi' }))).toThrow(SessionNotFoundError);
  });

  it('leve une erreur de domaine sur un mode de reponse inconnu', () => {
    const question = {
      id: 'sq-1', rank: 1, questionId: 'q-1', prompt: 'p', imageId: null, imageAlt: null,
      answerMode: 'dessin', timeLimitResolved: 20, accentsSensibles: true, casseSensible: false,
      options: [], acceptedAnswers: [], openedAt: null, deadlineAt: null, closedAt: null,
    };
    expect(() => lireSession(ligne({ questions: [question] }))).toThrow(InvalidQuestionShapeError);
  });

  it('rend une ligne saine sans la modifier', () => {
    const session = lireSession(ligne());
    expect(session.status).toBe('ouverte');
    expect(session.mode).toBe('defi');
  });
});

describe('violeLUnicite', () => {
  it('reconnait la contrainte visee', () => {
    expect(violeLUnicite(violation('P2002', ['joinCode', 'tenantId']), 'joinCode')).toBe(true);
  });

  it('ne deguise pas une autre violation d unicite', () => {
    expect(violeLUnicite(violation('P2002', ['id', 'tenantId']), 'joinCode')).toBe(false);
  });

  it('exige tous les champs de la contrainte visee', () => {
    const err = violation('P2002', ['sessionId', 'rank', 'tenantId']);
    expect(violeLUnicite(err, 'sessionQuestionId', 'participantId')).toBe(false);
  });

  it('ignore une erreur qui n est pas une violation d unicite', () => {
    expect(violeLUnicite(violation('P2003', ['joinCode']), 'joinCode')).toBe(false);
    expect(violeLUnicite(new Error('panne'), 'joinCode')).toBe(false);
  });

  it('ne traduit pas une cible illisible', () => {
    expect(violeLUnicite(violation('P2002', 'Quiz_Session_joinCode_tenantId_key'), 'joinCode')).toBe(false);
  });
});

describe('manqueLeParticipant', () => {
  const introuvable = (modelName: unknown) =>
    new Prisma.PrismaClientKnownRequestError('introuvable', {
      code: 'P2025', clientVersion: 'test', meta: { modelName, cause: 'No record was found' },
    });

  it('reconnait le participant introuvable d une ecriture imbriquee', () => {
    expect(manqueLeParticipant(introuvable('Quiz_Participant'))).toBe(true);
  });

  it('ne deguise pas une ligne introuvable d un autre modele', () => {
    expect(manqueLeParticipant(introuvable('Quiz_SessionQuestion'))).toBe(false);
    expect(manqueLeParticipant(introuvable(undefined))).toBe(false);
  });

  it('ignore une erreur qui n est pas une ligne introuvable', () => {
    expect(manqueLeParticipant(violation('P2002', ['sessionQuestionId', 'participantId', 'tenantId']))).toBe(false);
    expect(manqueLeParticipant(new Error('panne'))).toBe(false);
  });
});
