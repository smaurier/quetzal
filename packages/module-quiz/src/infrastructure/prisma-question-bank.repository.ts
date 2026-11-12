import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isAnswerMode } from '../domain/answer-mode.js';
import { BankNotFoundError, InvalidQuestionShapeError } from '../domain/errors.js';
import type {
  Bank,
  BankSummary,
  NewQuestion,
  Question,
  QuestionBankRepository,
  QuestionPatch,
} from '../domain/ports/question-bank.repository.js';

interface LigneOption {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  imageAlt: string | null;
  isCorrect: boolean;
}

interface LigneQuestion {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: string;
  timeLimit: number | null;
  accentsSensibles: boolean;
  casseSensible: boolean;
  options: LigneOption[];
  acceptedAnswers: { value: string }[];
}

interface LigneBanque {
  id: string;
  name: string;
  isTemplate: boolean;
  questions: LigneQuestion[];
}

/**
 * `findFirst` et les variantes *Many, jamais `findUnique` ni `update` : les
 * tables ont une clé composite `@@id([id, tenantId])` et l'extension de
 * cloisonnement fusionne `tenantId` à plat dans les variantes *Many. Même
 * raison que dans `prisma-deck.repository.ts` du loto.
 */
@Injectable()
export class PrismaQuestionBankRepository implements QuestionBankRepository {
  private get prisma() {
    // `as unknown as` sans typeguard : recopie du motif de
    // `prisma-deck.repository.ts` du loto, le client scopé est typé sur le
    // schéma mergé du noyau et un module ne peut pas l'importer (§3).
    return getTenantScopedPrisma() as unknown as {
      quiz_Deck: {
        findMany(args?: unknown): Promise<LigneBanque[]>;
        findFirst(args: unknown): Promise<LigneBanque | null>;
        create(args: unknown): Promise<{ id: string }>;
        updateMany(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<unknown>;
      };
      quiz_Question: {
        findFirst(args: unknown): Promise<LigneQuestion | null>;
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<unknown>;
      };
      quiz_Option: { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
      quiz_AcceptedAnswer: { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
    };
  }

  private toQuestion(ligne: LigneQuestion): Question {
    if (!isAnswerMode(ligne.answerMode)) {
      // Une ligne désynchronisée, comme un statut inconnu chez le loto : on ne
      // rend pas une question dont on ne sait pas la juger.
      throw new InvalidQuestionShapeError('choix', `mode inconnu en base : ${ligne.answerMode}`);
    }
    return {
      id: ligne.id,
      rank: ligne.rank,
      prompt: ligne.prompt,
      imageId: ligne.imageId,
      imageAlt: ligne.imageAlt,
      answerMode: ligne.answerMode,
      timeLimit: ligne.timeLimit,
      regles: {
        accentsSensibles: ligne.accentsSensibles,
        casseSensible: ligne.casseSensible,
      },
      // Trié par rang ici, et non laissé à l'ordre de la base : un `ORDER BY`
      // absent rend un ordre non garanti, et l'écran afficherait les
      // propositions dans le désordre une fois sur deux.
      options: [...ligne.options].sort((a, b) => a.rank - b.rank),
      acceptedAnswers: ligne.acceptedAnswers.map((a) => a.value),
    };
  }

  private get inclusion() {
    return {
      questions: {
        orderBy: { rank: 'asc' as const },
        include: { options: true, acceptedAnswers: true },
      },
    };
  }

  async list(): Promise<BankSummary[]> {
    const lignes = await this.prisma.quiz_Deck.findMany({
      orderBy: { name: 'asc' },
      include: this.inclusion,
    });
    return lignes.map((ligne) => ({
      id: ligne.id,
      name: ligne.name,
      isTemplate: ligne.isTemplate,
      questionCount: ligne.questions.length,
    }));
  }

  async findById(bankId: string): Promise<Bank | null> {
    const ligne = await this.prisma.quiz_Deck.findFirst({
      where: { id: bankId },
      include: this.inclusion,
    });
    if (ligne === null) return null;
    return {
      id: ligne.id,
      name: ligne.name,
      isTemplate: ligne.isTemplate,
      questionCount: ligne.questions.length,
      questions: ligne.questions.map((q) => this.toQuestion(q)),
    };
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    questions: readonly Question[];
  }): Promise<Bank> {
    const bankId = newId();
    await this.prisma.quiz_Deck.create({
      data: { id: bankId, name: input.name, isTemplate: input.isTemplate, createdBy: input.createdBy },
    });

    for (const question of input.questions) {
      const questionId = newId();
      await this.prisma.quiz_Question.createMany({
        data: [
          {
            id: questionId,
            deckId: bankId,
            rank: question.rank,
            prompt: question.prompt,
            imageId: question.imageId,
            imageAlt: question.imageAlt,
            answerMode: question.answerMode,
            timeLimit: question.timeLimit,
            accentsSensibles: question.regles.accentsSensibles,
            casseSensible: question.regles.casseSensible,
          },
        ],
      });
      if (question.options.length > 0) {
        await this.prisma.quiz_Option.createMany({
          data: question.options.map((option) => ({
            id: newId(),
            questionId,
            rank: option.rank,
            label: option.label,
            imageId: option.imageId,
            imageAlt: option.imageAlt,
            isCorrect: option.isCorrect,
          })),
        });
      }
      if (question.acceptedAnswers.length > 0) {
        await this.prisma.quiz_AcceptedAnswer.createMany({
          data: question.acceptedAnswers.map((value) => ({ id: newId(), questionId, value })),
        });
      }
    }

    const relue = await this.findById(bankId);
    // Jamais `as Bank` sur un `null` : CLAUDE.md §14 interdit le cast sans
    // typeguard. Et une banque introuvable juste après sa création signale un
    // cloisonnement mal posé, ce qu'un cast masquerait au lieu de le dire.
    if (relue === null) throw new BankNotFoundError(bankId);
    return relue;
  }

  async rename(bankId: string, name: string): Promise<void> {
    await this.prisma.quiz_Deck.updateMany({ where: { id: bankId }, data: { name } });
  }

  async delete(bankId: string): Promise<void> {
    await this.prisma.quiz_Deck.deleteMany({ where: { id: bankId } });
  }

  async addQuestion(bankId: string, question: NewQuestion): Promise<Question> {
    const id = newId();
    await this.prisma.quiz_Question.createMany({
      data: [{ id, deckId: bankId, rank: question.rank, prompt: question.prompt, answerMode: question.answerMode }],
    });
    return {
      id,
      rank: question.rank,
      prompt: question.prompt,
      imageId: null,
      imageAlt: null,
      answerMode: question.answerMode,
      timeLimit: null,
      regles: { accentsSensibles: true, casseSensible: false },
      options: [],
      acceptedAnswers: [],
    };
  }

  async updateQuestion(questionId: string, patch: QuestionPatch): Promise<void> {
    const champs: Record<string, unknown> = {};
    if (patch.prompt !== undefined) champs['prompt'] = patch.prompt;
    if (patch.imageId !== undefined) champs['imageId'] = patch.imageId;
    if (patch.imageAlt !== undefined) champs['imageAlt'] = patch.imageAlt;
    if (patch.timeLimit !== undefined) champs['timeLimit'] = patch.timeLimit;
    if (patch.regles !== undefined) {
      champs['accentsSensibles'] = patch.regles.accentsSensibles;
      champs['casseSensible'] = patch.regles.casseSensible;
    }
    if (Object.keys(champs).length > 0) {
      await this.prisma.quiz_Question.updateMany({ where: { id: questionId }, data: champs });
    }

    // Remplacement en bloc, et non fusion : une proposition retirée à l'écran
    // doit disparaître, et un rang réordonné ne doit pas laisser de doublon
    // derrière lui.
    if (patch.options !== undefined) {
      await this.prisma.quiz_Option.deleteMany({ where: { questionId } });
      if (patch.options.length > 0) {
        await this.prisma.quiz_Option.createMany({
          data: patch.options.map((option) => ({
            id: newId(),
            questionId,
            rank: option.rank,
            label: option.label,
            imageId: option.imageId,
            imageAlt: option.imageAlt,
            isCorrect: option.isCorrect,
          })),
        });
      }
    }
    if (patch.acceptedAnswers !== undefined) {
      await this.prisma.quiz_AcceptedAnswer.deleteMany({ where: { questionId } });
      if (patch.acceptedAnswers.length > 0) {
        await this.prisma.quiz_AcceptedAnswer.createMany({
          data: patch.acceptedAnswers.map((value) => ({ id: newId(), questionId, value })),
        });
      }
    }
  }

  async deleteQuestion(questionId: string): Promise<void> {
    await this.prisma.quiz_Question.deleteMany({ where: { id: questionId } });
  }
}
