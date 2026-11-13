import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaSessionRepository } from './prisma-session.repository.js';
import type { FrozenQuestion } from '../domain/ports/session.repository.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const FIGEE: Omit<FrozenQuestion, 'id'> = {
  rank: 1,
  questionId: 'q-origine',
  prompt: '¿Cómo se dice « chaise » ?',
  imageId: null,
  imageAlt: null,
  answerMode: 'choix',
  timeLimitResolved: 20,
  regles: { accentsSensibles: true, casseSensible: false },
  options: [
    { id: 'o-1', rank: 1, label: 'la silla', imageId: null, imageAlt: null, isCorrect: true },
    { id: 'o-2', rank: 2, label: 'la mesa', imageId: null, imageAlt: null, isCorrect: false },
  ],
  acceptedAnswers: [],
  openedAt: null,
  deadlineAt: null,
  closedAt: null,
};

describe('PrismaSessionRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  async function unJeu(tenantId: string, ownerId: string): Promise<string> {
    // La séance a besoin d'une banque existante : la clé étrangère de
    // Quiz_Session vers Quiz_Deck la rend obligatoire.
    const { PrismaQuestionBankRepository } = await import('./prisma-question-bank.repository.js');
    const banques = new PrismaQuestionBankRepository();
    const banque = await inTenant(tenantId, ownerId, () =>
      banques.create({ name: 'Vocabulaire', isTemplate: false, createdBy: ownerId, questions: [] }));
    return banque.id;
  }

  it('cree une seance et la relit par son code d entree', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId,
        mode: 'defi',
        maxParticipants: 6,
        defaultTimeLimit: 20,
        guestLocale: null,
        joinCode: 'ABCD1234',
        createdBy: ownerId,
      }));

    const relue = await inTenant(tenantId, ownerId, () => repo.findByJoinCode('ABCD1234'));
    expect(relue?.id).toBe(creee.id);
    expect(relue?.status, 'une seance nait en brouillon').toBe('brouillon');
  });

  /**
   * ⛔ Le figement est le coeur de D10. Les options et les reponses acceptees
   * sont ecrites en JSON : on verifie qu'elles reviennent INTACTES, parce qu'un
   * JSON mal relu ne se voit qu'en seance.
   */
  it('fige une question et la relit avec ses propositions intactes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'FIGE0001', createdBy: ownerId,
      }));

    await inTenant(tenantId, ownerId, () => repo.freezeQuestions(session.id, [FIGEE]));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(session.id));

    expect(relue?.questions).toHaveLength(1);
    expect(relue?.questions[0]?.timeLimitResolved).toBe(20);
    expect(relue?.questions[0]?.options).toEqual(FIGEE.options);
  });

  it('rend les questions figees dans l ordre de leur rang', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'ORDRE001', createdBy: ownerId,
      }));

    // Inserees a l'envers, exprès : un ORDER BY absent rendrait cet ordre.
    await inTenant(tenantId, ownerId, () =>
      repo.freezeQuestions(session.id, [
        { ...FIGEE, rank: 3, prompt: 'troisieme' },
        { ...FIGEE, rank: 1, prompt: 'premiere' },
        { ...FIGEE, rank: 2, prompt: 'deuxieme' },
      ]));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(session.id));

    expect(relue?.questions.map((q) => q.prompt)).toEqual([
      'premiere', 'deuxieme', 'troisieme',
    ]);
  });

  /**
   * ⛔ LE TEST QUI COMPTE LE PLUS. L'unicite d'une reponse par question et par
   * participant vit en base (@@unique). L'adaptateur doit traduire la violation
   * en `null`, et NON la laisser remonter en 500 : deux doigts sur un telephone
   * d'eleve suffisent a declencher deux emissions.
   */
  it('refuse une seconde reponse du meme participant, en rendant null', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'UNIQ0001', createdBy: ownerId,
      }));
    await inTenant(tenantId, ownerId, () => repo.freezeQuestions(session.id, [FIGEE]));
    const avecQuestions = await inTenant(tenantId, ownerId, () => repo.findById(session.id));
    const sqId = avecQuestions!.questions[0]!.id;
    const participant = await inTenant(tenantId, ownerId, () =>
      repo.addParticipant({ sessionId: session.id, participantIndex: 1 }));

    const base = {
      sessionQuestionId: sqId,
      participantId: participant.id,
      authorGuestId: 'g-1',
      optionId: 'o-1',
      value: null,
      isCorrect: true,
      elapsedMs: 1200,
      points: 1200,
    };

    const premiere = await inTenant(tenantId, ownerId, () => repo.recordAnswer(base));
    const seconde = await inTenant(tenantId, ownerId, () => repo.recordAnswer(base));

    expect(premiere).not.toBeNull();
    expect(seconde, 'la seconde est refusee, pas une exception').toBeNull();
    expect(await inTenant(tenantId, ownerId, () => repo.answersFor(sqId))).toHaveLength(1);
  });

  it('retrouve le participant d un invite, pour qu une reconnexion le retrouve', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const deckId = await unJeu(tenantId, ownerId);
    const repo = new PrismaSessionRepository();
    const session = await inTenant(tenantId, ownerId, () =>
      repo.create({
        deckId, mode: 'controle', maxParticipants: 6, defaultTimeLimit: null,
        guestLocale: null, joinCode: 'RECO0001', createdBy: ownerId,
      }));
    const participant = await inTenant(tenantId, ownerId, () =>
      repo.addParticipant({ sessionId: session.id, participantIndex: 1 }));

    await inTenant(tenantId, ownerId, () =>
      repo.addMember({ participantId: participant.id, guestId: 'g-7', displayName: 'Ana' }));
    // Deux fois : une reconnexion ne doit pas creer un second membre.
    await inTenant(tenantId, ownerId, () =>
      repo.addMember({ participantId: participant.id, guestId: 'g-7', displayName: 'Ana' }));

    const retrouve = await inTenant(tenantId, ownerId, () =>
      repo.findParticipantByGuest({ sessionId: session.id, guestId: 'g-7' }));
    expect(retrouve?.id).toBe(participant.id);
    expect(retrouve?.memberNames, 'un seul membre, pas deux').toEqual(['Ana']);
  });

  it('cloisonne les seances entre locataires', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const deckId = await unJeu(voisin.tenantId, voisin.ownerId);
    const repo = new PrismaSessionRepository();
    const sienne = await inTenant(voisin.tenantId, voisin.ownerId, () =>
      repo.create({
        deckId, mode: 'defi', maxParticipants: 6, defaultTimeLimit: 20,
        guestLocale: null, joinCode: 'VOISIN01', createdBy: voisin.ownerId,
      }));

    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findById(sienne.id)),
      'une seance d un autre locataire doit etre introuvable').toBeNull();
    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findByJoinCode('VOISIN01')),
      'et son code d entree ne doit pas la trouver non plus').toBeNull();
  });
});
