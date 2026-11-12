import { describe, it, expect } from 'vitest';
import { BankNotFoundError, InvalidQuestionShapeError } from '../domain/errors.js';
import { ManageBankUseCase } from './manage-bank.use-case.js';
import { FakeQuestionBankRepository, bankOf, questionOf } from './testing/fake-repositories.js';

function build() {
  const banks = new FakeQuestionBankRepository();
  const useCase = new ManageBankUseCase(banks);
  return { banks, useCase };
}

describe('ManageBankUseCase', () => {
  it('liste les banques avec leur nombre de questions', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(3));

    const liste = await useCase.list();

    expect(liste).toHaveLength(1);
    expect(liste[0]?.questionCount).toBe(3);
  });

  it('duplique une banque avec toutes ses questions', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(4, { name: 'Vocabulaire maison', isTemplate: true }));

    const copie = await useCase.duplicate({ bankId: 'bank-1', name: 'Ma copie', createdBy: 'u-1' });

    expect(copie.id).not.toBe('bank-1');
    expect(copie.name).toBe('Ma copie');
    expect(copie.questions).toHaveLength(4);
    expect(copie.isTemplate, 'une copie de travail n est jamais un gabarit').toBe(false);
  });

  it('cree une banque vide', async () => {
    const { useCase } = build();

    const banque = await useCase.createBlank({ name: 'Nouvelle', createdBy: 'u-1' });

    expect(banque.questions).toHaveLength(0);
  });

  it('refuse une banque inconnue', async () => {
    const { useCase } = build();

    await expect(useCase.findOne({ bankId: 'fantome' })).rejects.toThrow(BankNotFoundError);
  });

  it('ajoute une question au rang suivant, et non au nombre de questions', async () => {
    // Les rangs peuvent avoir des trous apres une suppression, et
    // @@unique([deckId, rank, tenantId]) refuserait un doublon.
    const { banks, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1), questionOf(7)] }));

    const ajoutee = await useCase.addQuestion({ bankId: 'bank-1', prompt: 'Nouvelle ?', answerMode: 'choix' });

    expect(ajoutee.rank, 'le rang le plus haut plus un, jamais le compte').toBe(8);
  });

  /**
   * ⛔ LA GARDE QUI COMPTE. Une question en `choix` sans proposition juste est
   * injouable : en séance, aucune réponse ne pourrait être correcte, et
   * personne ne s'en apercevrait avant la classe.
   */
  it('refuse d enregistrer une question a choix sans proposition juste', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: {
          options: [
            { rank: 1, label: 'A', imageId: null, imageAlt: null, isCorrect: false },
            { rank: 2, label: 'B', imageId: null, imageAlt: null, isCorrect: false },
          ],
        },
      })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('refuse une question a choix avec une seule proposition', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: { options: [{ rank: 1, label: 'Seule', imageId: null, imageAlt: null, isCorrect: true }] },
      })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('refuse une question en saisie sans aucune reponse acceptee', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(0, { questions: [questionOf(1, { answerMode: 'saisie', options: [] })] }));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({ questionId, patch: { acceptedAnswers: [] } })).rejects.toThrow(InvalidQuestionShapeError);
  });

  it('accepte une question a choix bien formee', async () => {
    const { banks, useCase } = build();
    banks.add(bankOf(1));
    const questionId = (await useCase.findOne({ bankId: 'bank-1' })).questions[0]!.id;

    await expect(
      useCase.updateQuestion({
        questionId,
        patch: {
          options: [
            { rank: 1, label: 'Juste', imageId: null, imageAlt: null, isCorrect: true },
            { rank: 2, label: 'Faux', imageId: null, imageAlt: null, isCorrect: false },
          ],
        },
      })).resolves.toBeUndefined();
  });
});
