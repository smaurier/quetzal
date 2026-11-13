import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@quetzal/db';
import { getCurrentTenant, getTenantScopedPrisma } from '@quetzal/core';
import { isAnswerMode } from '../domain/answer-mode.js';
import { isSessionMode } from '../domain/session-mode.js';
import { isSessionStatus } from '../domain/session-status.js';
import {
  InvalidQuestionShapeError,
  JoinCodeAlreadyUsedError,
  ParticipantIndexTakenError,
  ParticipantNotFoundError,
  SessionNotFoundError,
} from '../domain/errors.js';
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

const VIOLATION_UNICITE = 'P2002';
const LIGNE_INTROUVABLE = 'P2025';

/**
 * Chaque table de la séance porte deux contraintes d'unicité : la clé
 * `(id, tenantId)` et celle qui a un sens métier. Seule la seconde est un geste
 * répété qu'on traduit ; une violation de la clé est une vraie panne et doit
 * remonter telle quelle. Prisma nomme les champs violés dans `meta.target`
 * (mesuré contre Postgres : `["joinCode","tenantId"]`).
 */
export function violeLUnicite(err: unknown, ...champs: readonly string[]): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== VIOLATION_UNICITE) return false;
  const cible = err.meta?.['target'];
  if (!Array.isArray(cible)) return false;
  return champs.every((champ) => cible.includes(champ));
}

/** L'ordre d'arrivée, celui de la doublure ; l'id (UUID v7) départage deux lignes de la même microseconde. */
const PAR_ARRIVEE = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

/**
 * Un participant absent (ou d'un autre locataire) fait échouer l'écriture
 * imbriquée de `enregistrerReponse` en P2025, modèle nommé dans
 * `meta.modelName` (mesuré contre Postgres). Toute autre P2025 est une panne.
 */
export function manqueLeParticipant(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError
    && err.code === LIGNE_INTROUVABLE
    && err.meta?.['modelName'] === 'Quiz_Participant';
}

const COLONNES_REPONSE = {
  id: true,
  sessionQuestionId: true,
  participantId: true,
  authorGuestId: true,
  optionId: true,
  value: true,
  isCorrect: true,
  elapsedMs: true,
  points: true,
} as const;

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
export interface LigneSession {
  id: string; deckId: string; mode: string; status: string;
  maxParticipants: number; joinCode: string;
  defaultTimeLimit: number | null; guestLocale: string | null;
  questions: LigneQuestion[]; participants: LigneParticipant[];
}

/**
 * Les propositions figées sont relues d'un `Json`, donc `unknown`. Narrowé
 * sans `as` (CLAUDE.md §14) : une ligne mal formée en base ne doit pas
 * devenir une question injouable en silence.
 */
function lireOptions(valeur: unknown): readonly QuestionOption[] {
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

function lireChaines(valeur: unknown): readonly string[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter((v): v is string => typeof v === 'string');
}

function lireQuestion(ligne: LigneQuestion): FrozenQuestion {
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
    options: lireOptions(ligne.options),
    acceptedAnswers: lireChaines(ligne.acceptedAnswers),
    openedAt: ligne.openedAt,
    deadlineAt: ligne.deadlineAt,
    closedAt: ligne.closedAt,
  };
}

function lireParticipant(ligne: LigneParticipant): Participant {
  return {
    id: ligne.id,
    participantIndex: ligne.participantIndex,
    name: ligne.name,
    score: ligne.score,
    memberNames: ligne.members.map((m) => m.displayName),
  };
}

export function lireSession(ligne: LigneSession): Session {
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
    // Trié ici en plus de l'`orderBy` : sans ORDER BY, Postgres ne garantit
    // aucun ordre. Mesuré le 13/11, retirer les deux gardes des questions ne
    // fait rougir aucun test : l'index unique (sessionId, rank) rend l'ordre
    // aujourd'hui, ce qui n'est pas un contrat. Ne pas en retirer un sur la foi
    // d'un test vert.
    questions: [...ligne.questions]
      .sort((a, b) => a.rank - b.rank)
      .map(lireQuestion),
    participants: [...ligne.participants]
      .sort((a, b) => a.participantIndex - b.participantIndex)
      .map(lireParticipant),
  };
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
        create(args: unknown): Promise<LigneParticipant>;
        update(args: unknown): Promise<{ answers: AnswerRow[] }>;
        updateMany(args: unknown): Promise<unknown>;
      };
      quiz_Answer: { findMany(args: unknown): Promise<AnswerRow[]> };
    };
  }

  private get inclusion() {
    return {
      questions: { orderBy: { rank: 'asc' as const } },
      participants: {
        orderBy: { participantIndex: 'asc' as const },
        include: { members: { orderBy: PAR_ARRIVEE } },
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
    try {
      await this.creerLigne(id, input);
    } catch (err) {
      if (violeLUnicite(err, 'joinCode')) throw new JoinCodeAlreadyUsedError(input.joinCode);
      throw err;
    }
    const relue = await this.findById(id);
    // Jamais un cast sur un `null` : introuvable juste après création signale un
    // cloisonnement mal posé, ce qu'un cast masquerait.
    if (relue === null) throw new SessionNotFoundError(id);
    return relue;
  }

  private async creerLigne(id: string, input: Parameters<SessionRepository['create']>[0]): Promise<void> {
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
  }

  async findById(sessionId: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { id: sessionId },
      include: this.inclusion,
    });
    return ligne === null ? null : lireSession(ligne);
  }

  async findByJoinCode(joinCode: string): Promise<Session | null> {
    const ligne = await this.prisma.quiz_Session.findFirst({
      where: { joinCode },
      include: this.inclusion,
    });
    return ligne === null ? null : lireSession(ligne);
  }

  async list(): Promise<readonly Session[]> {
    const lignes = await this.prisma.quiz_Session.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.inclusion,
    });
    return lignes.map(lireSession);
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

  /**
   * Écriture imbriquée : Prisma la rend transactionnelle, et le membre hérite
   * le `tenantId` du participant par la clé étrangère composite (l'extension
   * de cloisonnement ne touche que le premier niveau).
   */
  async ajouterParticipant(input: {
    sessionId: string;
    participantIndex: number;
    guestId: string;
    displayName: string;
  }): Promise<Participant> {
    try {
      const ligne = await this.prisma.quiz_Participant.create({
        data: {
          id: newId(),
          sessionId: input.sessionId,
          participantIndex: input.participantIndex,
          members: {
            create: { id: newId(), guestId: input.guestId, displayName: input.displayName },
          },
        },
        include: { members: { orderBy: PAR_ARRIVEE } },
      });
      return lireParticipant(ligne);
    } catch (err) {
      if (violeLUnicite(err, 'sessionId', 'participantIndex')) {
        throw new ParticipantIndexTakenError(input.participantIndex);
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
      include: { members: { orderBy: PAR_ARRIVEE } },
    });
    return ligne === null ? null : lireParticipant(ligne);
  }

  async renameParticipant(input: { participantId: string; name: string | null }): Promise<void> {
    await this.prisma.quiz_Participant.updateMany({
      where: { id: input.participantId },
      data: { name: input.name },
    });
  }

  /**
   * Une seule écriture imbriquée depuis le participant : la réponse et
   * l'incrément réussissent ou échouent ensemble. `update` exige le sélecteur
   * composite `id_tenantId`, que l'extension ne sait pas poser : il est
   * fourni ici, et l'extension ajoute de toute façon son `tenantId` à plat.
   */
  async enregistrerReponse(answer: NewAnswer): Promise<AnswerRow | null> {
    const { participantId, ...reponse } = answer;
    const id = newId();
    try {
      const ligne = await this.prisma.quiz_Participant.update({
        where: { id_tenantId: { id: participantId, tenantId: getCurrentTenant().tenantId } },
        data: {
          score: { increment: answer.points },
          answers: { create: { id, ...reponse } },
        },
        select: { answers: { where: { id }, select: COLONNES_REPONSE } },
      });
      const ecrite = ligne.answers[0];
      if (ecrite === undefined) throw new SessionNotFoundError(`réponse ${id} introuvable après écriture`);
      return ecrite;
    } catch (err) {
      // ⛔ Rendu `null` et NON laissé remonter : deux doigts sur un téléphone
      // d'élève suffisent à déclencher deux émissions, et un 500 sur un
      // double-appui serait un défaut de produit.
      if (violeLUnicite(err, 'sessionQuestionId', 'participantId')) return null;
      if (manqueLeParticipant(err)) throw new ParticipantNotFoundError(participantId);
      throw err;
    }
  }

  async answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({
      where: { sessionQuestionId },
      orderBy: PAR_ARRIVEE,
      select: COLONNES_REPONSE,
    });
  }

  async allAnswers(sessionId: string): Promise<readonly AnswerRow[]> {
    return this.prisma.quiz_Answer.findMany({
      where: { sessionQuestion: { sessionId } },
      orderBy: { answeredAt: 'asc' },
      select: COLONNES_REPONSE,
    });
  }
}
