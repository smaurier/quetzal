import type { AnswerMode } from '../answer-mode.js';
import type { ReglesDeSaisie } from '../normalisation.js';

export interface BankSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  questionCount: number;
}

export interface QuestionOption {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  imageAlt: string | null;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: AnswerMode;
  timeLimit: number | null;
  regles: ReglesDeSaisie;
  options: readonly QuestionOption[];
  acceptedAnswers: readonly string[];
}

export interface Bank extends BankSummary {
  questions: readonly Question[];
}

export interface NewQuestion {
  rank: number;
  prompt: string;
  answerMode: AnswerMode;
}

export interface QuestionPatch {
  prompt?: string;
  imageId?: string | null;
  imageAlt?: string | null;
  timeLimit?: number | null;
  regles?: ReglesDeSaisie;
  options?: readonly Omit<QuestionOption, 'id'>[];
  acceptedAnswers?: readonly string[];
}

export interface QuestionBankRepository {
  list(): Promise<BankSummary[]>;
  findById(bankId: string): Promise<Bank | null>;
  create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank>;
  rename(bankId: string, name: string): Promise<void>;
  delete(bankId: string): Promise<void>;
  addQuestion(bankId: string, question: NewQuestion): Promise<Question>;
  updateQuestion(questionId: string, patch: QuestionPatch): Promise<void>;
  deleteQuestion(questionId: string): Promise<void>;
}
