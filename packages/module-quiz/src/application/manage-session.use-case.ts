import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { emitQuiz } from '@quetzal/core/events/quiz';
import {
  BankNotFoundError,
  InvalidSessionTransitionError,
  SessionNotFoundError,
  TimeLimitUnresolvableError,
} from '../domain/errors.js';
import { resoudreLeDelai } from '../domain/time-limit.js';
import { peutPasserA } from '../domain/session-status.js';
import type { SessionMode } from '../domain/session-mode.js';
import type { SessionStatus } from '../domain/session-status.js';
import type { QuestionBankRepository } from '../domain/ports/question-bank.repository.js';
import type { FrozenQuestion, Session, SessionRepository } from '../domain/ports/session.repository.js';

const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Huit caractères, sans `I`, `O`, `0` ni `1` : le code est lu sur un
 * vidéoprojecteur et retapé sur un téléphone, et ces quatre-là se confondent.
 * Même raisonnement que le `joinCode` du loto.
 */
function frapperUnCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET_CODE[Math.floor(Math.random() * ALPHABET_CODE.length)];
  }
  return code;
}

@Injectable()
export class ManageSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly banks: QuestionBankRepository,
    private readonly eventBus?: EventBus) {}

  async create(input: {
    deckId: string;
    mode: SessionMode;
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale?: string | null;
    createdBy: string;
  }): Promise<Session> {
    const banque = await this.banks.findById(input.deckId);
    if (banque === null) throw new BankNotFoundError(input.deckId);

    // Boucle de réessai plutôt qu'un seul tirage : deux séances qui
    // partageraient un code enverraient deux classes voisines dans la même
    // partie. La collision est improbable, pas impossible.
    for (let essai = 0; essai < 10; essai += 1) {
      const joinCode = frapperUnCode();
      if ((await this.sessions.findByJoinCode(joinCode)) !== null) continue;
      return this.sessions.create({
        deckId: input.deckId,
        mode: input.mode,
        maxParticipants: input.maxParticipants,
        defaultTimeLimit: input.defaultTimeLimit,
        guestLocale: input.guestLocale ?? null,
        joinCode,
        createdBy: input.createdBy,
      });
    }
    throw new SessionNotFoundError('aucun code d entrée libre après dix essais');
  }

  async open(input: { sessionId: string }): Promise<void> {
    await this.transition(input.sessionId, 'ouverte');
  }

  /**
   * ⛔ LE FIGEMENT (D10). La banque est copiée sur la séance, délais déjà
   * résolus, et plus rien ne relira la question vivante ensuite.
   *
   * ⛔ Et c'est TOUT OU RIEN : on résout les délais de toutes les questions
   * avant d'écrire la moindre ligne. Une séance à moitié figée est le pire état
   * possible devant une classe, et refuser ici, avant que l'écran s'allume,
   * est tout l'intérêt du refus.
   */
  async start(input: { sessionId: string }): Promise<void> {
    const session = await this.require(input.sessionId);
    if (!peutPasserA(session.status, 'en-cours')) {
      throw new InvalidSessionTransitionError(session.status, 'en-cours');
    }

    const banque = await this.banks.findById(session.deckId);
    if (banque === null) throw new BankNotFoundError(session.deckId);
    if (banque.questions.length === 0) {
      throw new TimeLimitUnresolvableError(0, 'la banque ne contient aucune question');
    }

    const figees: Omit<FrozenQuestion, 'id'>[] = [];
    for (const question of banque.questions) {
      const delai = resoudreLeDelai({
        mode: session.mode,
        questionTimeLimit: question.timeLimit,
        sessionDefault: session.defaultTimeLimit,
      });
      if (delai.kind === 'refuse') {
        throw new TimeLimitUnresolvableError(question.rank, delai.raison);
      }
      figees.push({
        rank: question.rank,
        questionId: question.id,
        prompt: question.prompt,
        imageId: question.imageId,
        imageAlt: question.imageAlt,
        answerMode: question.answerMode,
        timeLimitResolved: delai.seconds,
        regles: question.regles,
        options: question.options,
        acceptedAnswers: question.acceptedAnswers,
        openedAt: null,
        deadlineAt: null,
        closedAt: null,
      });
    }

    await this.sessions.freezeQuestions(session.id, figees);
    await this.sessions.setStatus(session.id, 'en-cours');

    if (this.eventBus !== undefined) {
      await emitQuiz(this.eventBus, 'quiz.session.started', {
        sessionId: session.id,
        deckId: session.deckId,
        mode: session.mode,
        questionCount: figees.length,
        participantCount: session.participants.length,
      });
    }
  }

  async rename(input: { participantId: string; name: string | null }): Promise<void> {
    // `null` est une valeur VOULUE et non une absence : c'est ainsi que
    // l'animatrice annule un renommage. Même décision que l'issue #29.
    const nettoye = input.name === null ? null : input.name.trim();
    await this.sessions.renameParticipant({
      participantId: input.participantId,
      name: nettoye === '' ? null : nettoye,
    });
  }

  async list(): Promise<readonly Session[]> {
    return this.sessions.list();
  }

  async findOne(input: { sessionId: string }): Promise<Session> {
    return this.require(input.sessionId);
  }

  private async transition(sessionId: string, vers: SessionStatus): Promise<void> {
    const session = await this.require(sessionId);
    if (!peutPasserA(session.status, vers)) {
      throw new InvalidSessionTransitionError(session.status, vers);
    }
    await this.sessions.setStatus(sessionId, vers);
  }

  private async require(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (session === null) throw new SessionNotFoundError(sessionId);
    return session;
  }
}
