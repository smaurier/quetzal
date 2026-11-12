import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaQuestionBankRepository } from './prisma-question-bank.repository.js';
import type { Question } from '../domain/ports/question-bank.repository.js';

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const QUESTION_CHOIX: Question = {
  id: 'ignoré-a-la-creation',
  rank: 1,
  prompt: '¿Cómo se dice « chaise » ?',
  imageId: null,
  imageAlt: null,
  answerMode: 'choix',
  timeLimit: null,
  regles: { accentsSensibles: true, casseSensible: false },
  options: [
    { id: 'x', rank: 1, label: 'la silla', imageId: null, imageAlt: null, isCorrect: true },
    { id: 'y', rank: 2, label: 'la mesa', imageId: null, imageAlt: null, isCorrect: false },
  ],
  acceptedAnswers: [],
};

describe('PrismaQuestionBankRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('cree une banque et la relit avec ses questions et propositions', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Vocabulaire', isTemplate: false, createdBy: ownerId, questions: [QUESTION_CHOIX] }));

    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));
    expect(relue?.questions).toHaveLength(1);
    expect(relue?.questions[0]?.options).toHaveLength(2);
    expect(relue?.questions[0]?.options.find((o) => o.isCorrect)?.label).toBe('la silla');
  });

  it('rend les propositions dans l ordre de leur rang, pas dans celui de la base', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    // DEUX questions, et non une seule : avec une seule, Postgres sert la
    // lecture imbriquée par un Index Scan sur
    // `Quiz_Option_questionId_rank_tenantId_key` et rend les propositions
    // triées par rang gratuitement, donc retirer le tri du code ne faisait pas
    // rougir le test. Dès la deuxième question, le même plan passe en Seq Scan
    // et rend l'ordre d'insertion : le tri du code devient la seule chose qui
    // garantisse le contrat. Mesuré par EXPLAIN, pas supposé.
    const desordre = (rank: number, prefixe: string): Question => ({
      ...QUESTION_CHOIX,
      rank,
      prompt: `${prefixe} : quelle proposition ?`,
      options: [
        { id: 'a', rank: 3, label: `${prefixe}3`, imageId: null, imageAlt: null, isCorrect: false },
        { id: 'b', rank: 1, label: `${prefixe}1`, imageId: null, imageAlt: null, isCorrect: true },
        { id: 'c', rank: 2, label: `${prefixe}2`, imageId: null, imageAlt: null, isCorrect: false },
      ],
    });

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({
        name: 'Ordre',
        isTemplate: false,
        createdBy: ownerId,
        questions: [desordre(2, 'B'), desordre(1, 'A')],
      }));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));

    expect(relue?.questions.map((q) => q.rank)).toEqual([1, 2]);
    expect(relue?.questions[0]?.options.map((o) => o.label)).toEqual(['A1', 'A2', 'A3']);
    expect(relue?.questions[1]?.options.map((o) => o.label)).toEqual(['B1', 'B2', 'B3']);
  });

  it('enregistre les reponses acceptees d une question en saisie', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const saisie: Question = {
      ...QUESTION_CHOIX,
      answerMode: 'saisie',
      options: [],
      acceptedAnswers: ['la casa', 'el hogar'],
    };

    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Saisie', isTemplate: false, createdBy: ownerId, questions: [saisie] }));
    const relue = await inTenant(tenantId, ownerId, () => repo.findById(creee.id));

    expect([...(relue?.questions[0]?.acceptedAnswers ?? [])].sort()).toEqual(['el hogar', 'la casa']);
  });

  it('supprimer une banque emporte ses questions et leurs propositions', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const creee = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'À supprimer', isTemplate: false, createdBy: ownerId, questions: [QUESTION_CHOIX] }));

    await inTenant(tenantId, ownerId, () => repo.delete(creee.id));

    expect(await inTenant(tenantId, ownerId, () => repo.findById(creee.id))).toBeNull();
  });

  it('cloisonne les banques entre locataires', async () => {
    const voisin = await seedTenant();
    const chezNous = await seedTenant();
    const repo = new PrismaQuestionBankRepository();
    const sienne = await inTenant(voisin.tenantId, voisin.ownerId, () =>
      repo.create({ name: 'Chez le voisin', isTemplate: false, createdBy: voisin.ownerId, questions: [] }));

    expect(
      await inTenant(chezNous.tenantId, chezNous.ownerId, () => repo.findById(sienne.id)),
      'une banque d un autre locataire doit etre introuvable').toBeNull();
  });
});
