import type {
  AnswerRow,
  FrozenQuestion,
  NewAnswer,
  Participant,
  Session,
  SessionRepository,
} from '../../domain/ports/session.repository.js';
import type { SessionStatus } from '../../domain/session-status.js';
import {
  JoinCodeAlreadyUsedError,
  ParticipantIndexTakenError,
  ParticipantNotFoundError,
  SessionNotFoundError,
} from '../../domain/errors.js';
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

export function frozenQuestionOf(
  rank: number,
  overrides: Partial<FrozenQuestion> = {}): FrozenQuestion {
  return {
    id: nextId('sq'),
    rank,
    questionId: nextId('q'),
    prompt: `Question ${rank}`,
    imageId: null,
    imageAlt: null,
    answerMode: 'choix',
    timeLimitResolved: 20,
    regles: { accentsSensibles: true, casseSensible: false },
    options: [
      { id: `o-juste-${rank}`, rank: 1, label: 'Juste', imageId: null, imageAlt: null, isCorrect: true },
      { id: `o-faux-${rank}`, rank: 2, label: 'Faux', imageId: null, imageAlt: null, isCorrect: false },
    ],
    acceptedAnswers: [],
    openedAt: null,
    deadlineAt: null,
    closedAt: null,
    ...overrides,
  };
}

export function sessionOf(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    deckId: 'bank-1',
    mode: 'defi',
    status: 'ouverte',
    maxParticipants: 6,
    joinCode: 'ABCD1234',
    defaultTimeLimit: 20,
    guestLocale: null,
    questions: [frozenQuestionOf(1), frozenQuestionOf(2)],
    participants: [],
    ...overrides,
  };
}

/**
 * Doublure écrite à la main (CLAUDE.md §11 interdit `vi.mock`). Elle porte une
 * décision qui compte : `enregistrerReponse` applique vraiment l'unicité par
 * `(question, participant)`, comme la contrainte en base. Sans ça, les tests de
 * cas d'usage passeraient sur une doublure plus permissive que la production.
 */
export class FakeSessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();
  private readonly answers: AnswerRow[] = [];
  private readonly membres = new Map<string, Map<string, string>>();

  add(session: Session): void {
    this.sessions.set(session.id, structuredClone(session));
  }

  /**
   * Préparation de test, hors port : pose une réponse sans toucher au score ni
   * exiger de participant, pour qu'un test de cas d'usage pose ses données sans
   * effet de bord. Le code de production n'a que `enregistrerReponse`.
   */
  poserReponse(answer: NewAnswer): AnswerRow {
    if (this.dejaRepondu(answer)) {
      throw new Error(`reponse deja posee dans la doublure : ${answer.participantId}`);
    }
    const ligne: AnswerRow = { ...answer, id: nextId('answer') };
    this.answers.push(ligne);
    return { ...ligne };
  }

  private dejaRepondu(answer: NewAnswer): boolean {
    return this.answers.some(
      (a) => a.sessionQuestionId === answer.sessionQuestionId && a.participantId === answer.participantId);
  }

  private participantConnu(participantId: string): boolean {
    return [...this.sessions.values()].some((s) => s.participants.some((p) => p.id === participantId));
  }

  private participantRendu(participant: Participant): Participant {
    const membres = this.membres.get(participant.id);
    return {
      ...structuredClone(participant),
      memberNames: membres === undefined ? [...participant.memberNames] : [...membres.values()],
    };
  }

  private rendre(session: Session): Session {
    return {
      ...structuredClone({ ...session, participants: [], questions: [] }),
      questions: structuredClone([...session.questions].sort((a, b) => a.rank - b.rank)),
      participants: [...session.participants]
        .sort((a, b) => a.participantIndex - b.participantIndex)
        .map((p) => this.participantRendu(p)),
    };
  }

  private muter(sessionId: string, patch: (session: Session) => Session): void {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) this.sessions.set(sessionId, patch(session));
  }

  private questionById(sessionQuestionId: string): { session: Session; question: FrozenQuestion } | null {
    for (const session of this.sessions.values()) {
      const question = session.questions.find((candidate) => candidate.id === sessionQuestionId);
      if (question !== undefined) return { session, question };
    }
    return null;
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
    // La base refuse un joinCode en double dans un locataire (@@unique([joinCode, tenantId])).
    if ([...this.sessions.values()].some((s) => s.joinCode === input.joinCode)) {
      throw new JoinCodeAlreadyUsedError(input.joinCode);
    }
    const session = sessionOf({
      id: nextId('session'),
      deckId: input.deckId,
      mode: input.mode,
      status: 'brouillon',
      maxParticipants: input.maxParticipants,
      defaultTimeLimit: input.defaultTimeLimit,
      guestLocale: input.guestLocale,
      joinCode: input.joinCode,
      questions: [],
      participants: [],
    });
    this.sessions.set(session.id, session);
    return this.rendre(session);
  }

  async findById(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session === undefined ? null : this.rendre(session);
  }

  async findByJoinCode(joinCode: string): Promise<Session | null> {
    const session = [...this.sessions.values()].find((s) => s.joinCode === joinCode);
    return session === undefined ? null : this.rendre(session);
  }

  async list(): Promise<readonly Session[]> {
    return [...this.sessions.values()].map((s) => this.rendre(s));
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    this.muter(sessionId, (session) => ({ ...session, status }));
  }

  async demarrer(
    sessionId: string,
    questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new SessionNotFoundError(sessionId);
    // La base refuse un rang déjà figé dans la séance (@@unique([sessionId, rank, tenantId]))
    // et annule toute l'écriture, statut compris.
    const rangs = [...session.questions, ...questions].map((q) => q.rank);
    if (new Set(rangs).size !== rangs.length) {
      throw new Error(`rang deja fige dans la seance ${sessionId}`);
    }
    this.sessions.set(sessionId, {
      ...session,
      status: 'en-cours',
      questions: [
        ...session.questions,
        ...structuredClone(questions).map((q) => ({ ...q, id: nextId('sq') })),
      ],
    });
  }

  async openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void> {
    const trouve = this.questionById(input.sessionQuestionId);
    if (trouve === null) return;
    this.muter(trouve.session.id, (session) => ({
      ...session,
      questions: session.questions.map((q) =>
        q.id === input.sessionQuestionId
          ? { ...q, openedAt: structuredClone(input.openedAt), deadlineAt: structuredClone(input.deadlineAt) }
          : q),
    }));
  }

  async closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void> {
    const trouve = this.questionById(input.sessionQuestionId);
    if (trouve === null) return;
    this.muter(trouve.session.id, (session) => ({
      ...session,
      questions: session.questions.map((q) =>
        q.id === input.sessionQuestionId ? { ...q, closedAt: structuredClone(input.closedAt) } : q),
    }));
  }

  async ajouterParticipant(input: {
    sessionId: string;
    participantIndex: number;
    guestId: string;
    displayName: string;
  }): Promise<Participant> {
    const existante = this.sessions.get(input.sessionId);
    if (existante?.participants.some((p) => p.participantIndex === input.participantIndex) === true) {
      throw new ParticipantIndexTakenError(input.participantIndex);
    }
    const participant: Participant = {
      id: nextId('participant'),
      participantIndex: input.participantIndex,
      name: null,
      score: 0,
      memberNames: [],
    };
    this.muter(input.sessionId, (session) => ({
      ...session,
      participants: [...session.participants, participant],
    }));
    this.membres.set(participant.id, new Map([[input.guestId, input.displayName]]));
    return this.participantRendu(participant);
  }

  async findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null> {
    const session = this.sessions.get(input.sessionId);
    if (session === undefined) return null;
    for (const participant of session.participants) {
      if (this.membres.get(participant.id)?.has(input.guestId) === true) {
        return this.participantRendu(participant);
      }
    }
    return null;
  }

  async renameParticipant(input: { participantId: string; name: string | null }): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.participants.some((p) => p.id === input.participantId)) continue;
      this.muter(session.id, (courante) => ({
        ...courante,
        participants: courante.participants.map((p) =>
          p.id === input.participantId ? { ...p, name: input.name } : p),
      }));
      return;
    }
  }

  async enregistrerReponse(answer: NewAnswer): Promise<AnswerRow | null> {
    // ⛔ L'unicite est appliquee ICI aussi, parce que la base l'applique. Une
    // doublure plus permissive que la production ferait passer des tests de cas
    // d'usage qui echoueraient en vrai.
    if (this.dejaRepondu(answer)) return null;
    // La base refuse un participant inconnu (P2025, traduite par l'adaptateur).
    if (!this.participantConnu(answer.participantId)) throw new ParticipantNotFoundError(answer.participantId);

    const ligne: AnswerRow = { ...answer, id: nextId('answer') };
    this.answers.push(ligne);
    this.ajouterAuScore(answer.participantId, answer.points);
    return { ...ligne };
  }

  private ajouterAuScore(participantId: string, points: number): void {
    for (const session of this.sessions.values()) {
      if (!session.participants.some((p) => p.id === participantId)) continue;
      this.muter(session.id, (courante) => ({
        ...courante,
        participants: courante.participants.map((p) =>
          p.id === participantId ? { ...p, score: p.score + points } : p),
      }));
      return;
    }
  }

  async answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]> {
    return this.answers.filter((a) => a.sessionQuestionId === sessionQuestionId).map((a) => ({ ...a }));
  }

  async allAnswers(sessionId: string): Promise<readonly AnswerRow[]> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return [];
    const ids = new Set(session.questions.map((q) => q.id));
    return this.answers.filter((a) => ids.has(a.sessionQuestionId)).map((a) => ({ ...a }));
  }
}
