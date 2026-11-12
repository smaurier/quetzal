import { Injectable } from '@nestjs/common';
import { BankNotFoundError, InvalidQuestionShapeError, QuestionNotFoundError } from '../domain/errors.js';
import type { AnswerMode } from '../domain/answer-mode.js';
import type {
  Bank,
  BankSummary,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../domain/ports/question-bank.repository.js';

@Injectable()
export class ManageBankUseCase {
  constructor(private readonly banks: QuestionBankRepository) {}

  async list(): Promise<BankSummary[]> {
    return this.banks.list();
  }

  async findOne(input: { bankId: string }): Promise<Bank> {
    return this.require(input.bankId);
  }

  async duplicate(input: { bankId: string; name: string; createdBy: string }): Promise<Bank> {
    const source = await this.require(input.bankId);
    // Une copie de travail n'est jamais un gabarit : c'est ce qui permet de
    // retrouver le gabarit par `isTemplate` plutôt que par son nom.
    return this.banks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      questions: source.questions,
    });
  }

  async createBlank(input: { name: string; createdBy: string }): Promise<Bank> {
    return this.banks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      questions: [],
    });
  }

  async rename(input: { bankId: string; name: string }): Promise<void> {
    await this.require(input.bankId);
    await this.banks.rename(input.bankId, input.name);
  }

  async delete(input: { bankId: string }): Promise<void> {
    await this.require(input.bankId);
    await this.banks.delete(input.bankId);
  }

  async addQuestion(input: {
    bankId: string;
    prompt: string;
    answerMode: AnswerMode;
  }): Promise<Question> {
    const bank = await this.require(input.bankId);
    // Le rang le plus haut plus un, et non le nombre de questions : les rangs
    // peuvent avoir des trous après une suppression, et
    // @@unique([deckId, rank, tenantId]) refuserait un doublon.
    const rank = bank.questions.reduce((haut, q) => Math.max(haut, q.rank), 0) + 1;
    return this.banks.addQuestion(input.bankId, {
      rank,
      prompt: input.prompt,
      answerMode: input.answerMode,
    });
  }

  async updateQuestion(input: { questionId: string; patch: QuestionPatch }): Promise<void> {
    const question = await this.requireQuestion(input.questionId);
    const apres = { ...question, ...input.patch };
    this.assertJouable(apres.answerMode, apres.options, apres.acceptedAnswers);
    await this.banks.updateQuestion(input.questionId, input.patch);
  }

  async deleteQuestion(input: { questionId: string }): Promise<void> {
    await this.requireQuestion(input.questionId);
    await this.banks.deleteQuestion(input.questionId);
  }

  /**
   * ⛔ La seule garde qui empêche une question injouable d'arriver en classe.
   * Une question en `choix` sans proposition juste ne pourrait être réussie par
   * personne, et rien ne le signalerait avant la séance.
   */
  private assertJouable(
    mode: AnswerMode,
    options: readonly { isCorrect: boolean }[],
    acceptedAnswers: readonly string[]): void {
    if (mode === 'choix') {
      if (options.length < 2) {
        throw new InvalidQuestionShapeError(mode, 'au moins deux propositions sont nécessaires');
      }
      const justes = options.filter((option) => option.isCorrect).length;
      if (justes !== 1) {
        throw new InvalidQuestionShapeError(mode, 'exactement une proposition juste est attendue');
      }
      return;
    }
    if (acceptedAnswers.length === 0) {
      throw new InvalidQuestionShapeError(mode, 'au moins une réponse acceptée est nécessaire');
    }
  }

  private async require(bankId: string): Promise<Bank> {
    const bank = await this.banks.findById(bankId);
    if (bank === null) throw new BankNotFoundError(bankId);
    return bank;
  }

  private async requireQuestion(questionId: string): Promise<Question> {
    for (const bank of await this.banks.list()) {
      const complete = await this.banks.findById(bank.id);
      const trouvee = complete?.questions.find((q) => q.id === questionId);
      if (trouvee !== undefined) return trouvee;
    }
    throw new QuestionNotFoundError(questionId);
  }
}
