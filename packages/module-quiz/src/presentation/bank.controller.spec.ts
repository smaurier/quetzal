import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import {
  FakeQuestionBankRepository,
  bankOf,
} from '../application/testing/fake-repositories.js';
import { BankController } from './bank.controller.js';

/**
 * Une proposition sans rien à afficher ne doit pas atteindre la base (#100).
 *
 * L'éditeur la refuse depuis #88, mais c'est une garde côté client : un PATCH
 * à la main, un seed ou un import la contournent. Le rouge doit donc venir de
 * la route, pas de l'écran.
 */
describe('BankController, propositions affichables', () => {
  let banque: FakeQuestionBankRepository;
  let controleur: BankController;
  let questionId: string;

  beforeEach(async () => {
    banque = new FakeQuestionBankRepository();
    banque.add(bankOf(1));
    controleur = new BankController(new ManageBankUseCase(banque));
    questionId = (await banque.findById('bank-1'))!.questions[0]!.id;
  });

  function avecPremiereProposition(premiere: { label: string | null; imageId: string | null }) {
    return {
      options: [
        { rank: 1, ...premiere, isCorrect: true },
        { rank: 2, label: 'Faux', imageId: null, isCorrect: false },
      ],
    };
  }

  it('refuse une proposition au libelle vide sans image', async () => {
    await expect(
      controleur.patchQuestion('bank-1', questionId, avecPremiereProposition({ label: '', imageId: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Trois espaces n'affichent rien non plus : `.trim()` doit passer avant la borne. */
  it('refuse une proposition faite seulement d espaces', async () => {
    await expect(
      controleur.patchQuestion('bank-1', questionId, avecPremiereProposition({ label: '   ', imageId: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** La contre-épreuve : une image seule a de quoi s'afficher. */
  it('accepte une proposition en image seule', async () => {
    await expect(
      controleur.patchQuestion('bank-1', questionId, avecPremiereProposition({ label: null, imageId: 'image-1' })),
    ).resolves.toBeDefined();
  });

  it('accepte une proposition avec un libelle', async () => {
    await expect(
      controleur.patchQuestion('bank-1', questionId, avecPremiereProposition({ label: 'Juste', imageId: null })),
    ).resolves.toBeDefined();
  });
});
