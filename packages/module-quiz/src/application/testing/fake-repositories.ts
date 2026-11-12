import type {
  Bank,
  BankSummary,
  NewQuestion,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../../domain/ports/question-bank.repository.js';

let compteur = 0;
const nextId = (prefixe: string): string => `${prefixe}-gen-${++compteur}`;

export function questionOf(rank: number, overrides: Partial<Question> = {}): Question {
  return {
    id: nextId('question'),
    rank,
    prompt: `Question ${rank}`,
    imageId: null,
    imageAlt: null,
    answerMode: 'choix',
    timeLimit: null,
    regles: { accentsSensibles: true, casseSensible: false },
    options: [
      { id: nextId('option'), rank: 1, label: 'Juste', imageId: null, imageAlt: null, isCorrect: true },
      { id: nextId('option'), rank: 2, label: 'Faux', imageId: null, imageAlt: null, isCorrect: false },
    ],
    acceptedAnswers: [],
    ...overrides,
  };
}

export function bankOf(questionCount: number, overrides: Partial<Bank> = {}): Bank {
  const questions = Array.from({ length: questionCount }, (_, i) => questionOf(i + 1));
  return {
    id: 'bank-1',
    name: 'Banque de test',
    isTemplate: false,
    questionCount: questions.length,
    questions,
    ...overrides,
  };
}

/**
 * Les propositions du patch n'ont pas d'identifiant, `QuestionPatch.options`
 * est un `Omit<QuestionOption, 'id'>[]`, parce que l'écran les remplace en bloc.
 * La doublure en frappe donc de nouveaux, comme l'adaptateur Prisma le fera.
 */
function applique(question: Question, patch: QuestionPatch): Question {
  return {
    ...question,
    ...patch,
    options:
      patch.options === undefined
        ? question.options
        : patch.options.map((option) => ({ ...option, id: nextId('option') })),
  };
}

export class FakeQuestionBankRepository implements QuestionBankRepository {
  readonly banks = new Map<string, Bank>();

  add(bank: Bank): void {
    this.banks.set(bank.id, bank);
  }

  async list(): Promise<BankSummary[]> {
    return [...this.banks.values()].map(({ id, name, isTemplate, questions }) => ({
      id,
      name,
      isTemplate,
      questionCount: questions.length,
    }));
  }

  async findById(bankId: string): Promise<Bank | null> {
    return this.banks.get(bankId) ?? null;
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank> {
    const bank: Bank = {
      id: nextId('bank'),
      name: input.name,
      isTemplate: input.isTemplate,
      questionCount: input.questions.length,
      questions: input.questions.map((q) => ({ ...q, id: nextId('question') })),
    };
    this.banks.set(bank.id, bank);
    return bank;
  }

  async rename(bankId: string, name: string): Promise<void> {
    const bank = this.banks.get(bankId);
    if (bank !== undefined) this.banks.set(bankId, { ...bank, name });
  }

  async delete(bankId: string): Promise<void> {
    this.banks.delete(bankId);
  }

  async addQuestion(bankId: string, question: NewQuestion): Promise<Question> {
    const bank = this.banks.get(bankId);
    if (bank === undefined) throw new Error(`banque absente de la doublure : ${bankId}`);
    const inseree = questionOf(question.rank, {
      prompt: question.prompt,
      answerMode: question.answerMode,
      options: [],
      acceptedAnswers: [],
    });
    const questions = [...bank.questions, inseree];
    this.banks.set(bankId, { ...bank, questions, questionCount: questions.length });
    return inseree;
  }

  async updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
    for (const [bankId, bank] of this.banks) {
      if (!bank.questions.some((q) => q.id === questionId)) continue;
      this.banks.set(bankId, {
        ...bank,
        questions: bank.questions.map((q) => (q.id === questionId ? applique(q, patch) : q)),
      });
      return;
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    for (const [bankId, bank] of this.banks) {
      if (!bank.questions.some((q) => q.id === questionId)) continue;
      const questions = bank.questions.filter((q) => q.id !== questionId);
      this.banks.set(bankId, { ...bank, questions, questionCount: questions.length });
      return;
    }
  }
}
