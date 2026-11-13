import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isAnswerMode } from '../domain/answer-mode.js';
import { isSessionMode } from '../domain/session-mode.js';
import { isSessionStatus } from '../domain/session-status.js';
import { InvalidQuestionShapeError, SessionNotFoundError } from '../domain/errors.js';
import type { QuestionOption } from '../domain/ports/question-bank.repository.js';
import type {
  AnswerRow,
  FrozenQuestion,
  NewAnswer,
  Participant,
  Session,
  SessionRepository,
} from '../domain/ports/session.repository.js';
import type { SessionStatus } from '../domain/session-status.js';

/** La violation d'unicité de Prisma. Pas une panne : un geste répété. */
const VIOLATION_UNICITE = 'P2002';

interface LigneMembre { guestId: string; displayName: string }
interface LigneParticipant {
  id: string; participantIndex: number; name: string | null; score: number;
  members: LigneMembre[];
}
interface LigneQuestion {
  id: string; rank: number; questionId: string; prompt: string;
  imageId: string | null; imageAlt: string | null; answerMode: string;
  timeLimitResolved: number | null;
  accentsSensibles: boolean; casseSensible: boolean;
  options: unknown; acceptedAnswers: unknown;
  openedAt: Date | null; deadlineAt: Date | null; closedAt: Date | null;
}
interface LigneSession {
  id: string; deckId: string; mode: string; status: string;
  maxParticipants: number; joinCode: string;
  defaultTimeLimit: number | null; guestLocale: string | null;
  questions: LigneQuestion[]; participants: LigneParticipant[];
}

/**
 * ⛔ `findFirst` et les variantes `*Many`, jamais `findUnique` ni `update` :
 * les tables ont une clé composite `@@id([id, tenantId])` et l'extension de
 * cloisonnement fusionne `tenantId` à plat dans les `*Many`. Même raison que
 * dans les dépôts du loto.
 */
@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  private get prisma() {
    return getTenantScopedPrisma() as unknown as {
      quiz_Session: {
        findMany(args?: unknown): Promise<LigneSession[]>;
        findFirst(args: unknown): Promise<LigneSession | null>;
        create(args: unknown): Promise<{ id: string }>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_SessionQuestion: {
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_Participant: {
        findFirst(args: unknown): Promise<LigneParticipant | null>;
        createMany(args: unknown): Promise<unknown>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_Member: { createMany(args: unknown): Promise<unknown> };
      quiz_Answer: {
        create(args: unknown): Promise<AnswerRow>;
        findMany(args: unknown): Promise<AnswerRow[]>;
      };
    };
  }

  /**
   * Les propositions figées sont relues d'un `Json`, donc `unknown`. Narrowé
   * sans `as` (CLAUDE.md §14) : une ligne mal formée en base ne doit pas
   * devenir une question injouable en silence.
   */
  private lireOptions(valeur: unknown): readonly QuestionOption[] {
    if (!Array.isArray(valeur)) return [];
    const options: QuestionOption[] = [];
    for (const brut of valeur) {
      if (typeof brut !== 'object' || brut === null) continue;
      if (!('id' in brut) || typeof brut.id !== 'string') continue;
      if (!('rank' in brut) || typeof brut.rank !== 'number') continue;
      options.push({
        id: brut.id,
        rank: brut.rank,
        label: 'label' in brut && typeof brut.label === 'string' ? brut.label : null,
        imageId: 'imageId' in brut && typeof brut.imageId === 'string' ? brut.imageId : null,
        imageAlt: 'imageAlt' in brut && typeof brut.imageAlt === 'string' ? brut.imageAlt : null,
        isCorrect: 'isCorrect' in brut && brut.isCorrect === true,
      });
    }
    return options.sort((a, b) => a.rank - b.rank);
  }

  private lireChaines(valeur: unknown): readonly string[] {
    if (!Array.isArray(valeur)) return [];
    return valeur.filter((v): v is string => typeof v === 'string');
  }

  private toQuestion(ligne: LigneQuestion): FrozenQuestion {
    if (!isAnswerMode(ligne.answerMode)) {
      throw new InvalidQuestionShapeError('choix', `mode inconnu en base : ${ligne.answerMode}`);
    }
    return {
      id: ligne.id,
      rank: ligne.rank,
      questionId: ligne.questionId,
      prompt: ligne.prompt,
      imageId: ligne.imageId,
      imageAlt: ligne.imageAlt,
      answerMode: ligne.answerMode,
      timeLimitResolved: ligne.timeLimitResolved,
      regles: {
        accentsSensibles: ligne.accentsSensibles,
        casseSensible: ligne.casseSensible,
      },
      options: this.lireOptions(ligne.options),
      acceptedAnswers: this.lireChaines(ligne.acceptedAnswers),
      openedAt: ligne.openedAt,
      deadlineAt: ligne.deadlineAt,
      closedAt: ligne.closedAt,
    };
  }

  private toParticipant(ligne: LigneParticipant): Participant {
    return {
      id: ligne.id,
      participantIndex: ligne.participantIndex,
      name: ligne.name,
      score: ligne.score,
      memberNames: ligne.members.map((m) => m.displayName),
    };
  }

  private toSession(ligne: LigneSession): Session {
    if (!isSessionMode(ligne.mode)) {
      throw new SessionNotFoundError(`${ligne.id} (mode inconnu : ${ligne.mode})`);
    }
    if (!isSessionStatus(ligne.status)) {
      throw new SessionNotFoundError(`${ligne.id} (statut inconnu : ${ligne.status})`);
    }
    return {
      id: ligne.id,
      deckId: ligne.deckId,
      mode: ligne.mode,
      status: ligne.status,
      maxParticipants: ligne.maxParticipants,
      joinCode: ligne.joinCode,
      defaultTimeLimit: ligne.defaultTimeLimit,
      guestLocale: ligne.guestLocale,
      // Trié par rang ici, et non laissé à l'ordre de la base : sans ORDER BY,
      // l'ordre n'est pas garanti, et une séance jouerait ses questions dans le
      // désordre une fois sur deux.
      questions: [...ligne.questions]
        .sort((a, b) => a.rank - b.rank)
        .map((q) => this.toQuestion(q)),
      participants: [...ligne.participants]
        .sort((a, b) => a.participantIndex - b.participantIndex)
        .map((p) => this.toParticipant(p)),
    };
  }

  private get inclusion() {
    return {
      questions: { orderBy: { rank: 'asc' as const } },
      participants: {
        orderBy: { participantIndex: 'asc' as const },
        include: { members: true },
      },
    };
  }

  async create(input: {
    deckId: string;
    mode: Session['mode'];
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale: string | null;
    joinCode: string;
    createdBy: string;
  }): Promise<Session> {
    const id = newId();
    await this.prisma.quiz_Session.create({
      data: {
        id,
        deckId: input.deckId,
        mode: input.mode,
        status: 'brouillon',
        maxParticipants: input.maxParticipants,
        defaultTimeLimit: input.defaultTimeLimit,
        guestLocale: input.guestLocale,
        joinCode: input.joinCode,
        createdBy: input.createdBy,
      },
    });
    const relue = await this.findById(id);
    // Jamais un cast sur un `null` : introuvable juste après création signale un
    // cloisonnement mal posé, ce qu'un cast masquerait.
    if (relue === null) throw new SessionNotFoundError(id);
    return relue;
  }

  async findById(sessionId: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { id: sessionId },
      include: this.inclusion,
    });
    return ligne === null ? null : this.toSession(ligne);
  }

  async findByJoinCode(joinCode: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { joinCode },
      include: this.inclusion,
    });
    return ligne === null ? null : this.toSession(ligne);
  }

  async list(): Promise<readonly Session[]> {
    const lignes = await this.prisma.quiz_Session.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.inclusion,
    });
    return lignes.map((ligne) => this.toSession(ligne));
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const horodatage =
      status === 'en-cours' ? { startedAt: new Date() }
      : status === 'terminee' ? { finishedAt: new Date() }
      : {};
    await this.prisma.quiz_Session.updateMany({
      where: { id: sessionId },
      data: { status, ...horodatage },
    });
  }

  async freezeQuestions(
    sessionId: string,
    questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void> {
    if (questions.length === 0) return;
    // `createMany` en une fois : un figement partiel serait une séance à moitié
    // jouable, et c'est le pire état possible devant une classe.
    await this.prisma.quiz_SessionQuestion.createMany({
      data: questions.map((q) => ({
        id: newId(),
        sessionId,
        rank: q.rank,
        questionId: q.questionId,
        prompt: q.prompt,
        imageId: q.imageId,
        imageAlt: q.imageAlt,
        answerMode: q.answerMode,
        timeLimitResolved: q.timeLimitResolved,
        accentsSensibles: q.regles.accentsSensibles,
        casseSensible: q.regles.casseSensible,
        options: q.options,
        acceptedAnswers: q.acceptedAnswers,
      })),
    });
  }

  async openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void> {
    await this.prisma.quiz_SessionQuestion.updateMany({
      where: { id: input.sessionQuestionId },
      data: { openedAt: input.openedAt, deadlineAt: input.deadlineAt },
    });
  }

  async closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void> {
    await this.prisma.quiz_SessionQuestion.updateMany({
      where: { id: input.sessionQuestionId },
      data: { closedAt: input.closedAt },
    });
  }

  async addParticipant(input: {
    sessionId: string;
    participantIndex: number;
  }): Promise<Participant> {
    const id = newId();
    await this.prisma.quiz_Participant.createMany({
      data: [{ id, sessionId: input.sessionId, participantIndex: input.participantIndex }],
    });
    return {
      id,
      participantIndex: input.participantIndex,
      name: null,
      score: 0,
      memberNames: [],
    };
  }

  async addMember(input: {
    participantId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    try {
      await this.prisma.quiz_Member.createMany({
        data: [{
          id: newId(),
          participantId: input.participantId,
          guestId: input.guestId,
          displayName: input.displayName,
        }],
      });
    } catch (err) {
      // Idempotent : `@@unique([participantId, guestId, tenantId])` refuse le
      // doublon, et une reconnexion n'est pas une erreur.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === VIOLATION_UNICITE) {
        return;
      }
      throw err;
    }
  }

  async findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null> {
    const ligne = await this.prisma.quiz_Participant.findFirst({
      where: { sessionId: input.sessionId, members: { some: { guestId: input.guestId } } },
      include: { members: true },
    });
    return ligne === null ? null : this.toParticipant(ligne);
  }

  async renameParticipant(input: { participantId: string; name: string | null }): Promise<void> {
    await this.prisma.quiz_Participant.updateMany({
      where: { id: input.participantId },
      data: { name: input.name },
    });
  }

  async recordAnswer(answer: NewAnswer): Promise<AnswerRow | null> {
    try {
      return await this.prisma.quiz_Answer.create({ data: { id: newId(), ...answer } });
    } catch (err) {
      // ⛔ Rendu `null` et NON laissé remonter : deux doigts sur un téléphone
      // d'élève suffisent à déclencher deux émissions, et un 500 sur un
      // double-appui serait un défaut de produit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === VIOLATION_UNICITE) {
        return null;
      }
      throw err;
    }
  }

  async addToScore(input: { participantId: string; points: number }): Promise<void> {
    await this.prisma.quiz_Participant.updateMany({
      where: { id: input.participantId },
      data: { score: { increment: input.points } },
    });
  }

  async answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({ where: { sessionQuestionId } });
  }

  async allAnswers(sessionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({
      where: { sessionQuestion: { sessionId } },
      orderBy: { answeredAt: 'asc' },
    });
  }
}
