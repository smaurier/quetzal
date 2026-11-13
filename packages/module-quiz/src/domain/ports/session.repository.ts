import type { AnswerMode } from '../answer-mode.js';
import type { SessionMode } from '../session-mode.js';
import type { SessionStatus } from '../session-status.js';
import type { ReglesDeSaisie } from '../normalisation.js';
import type { QuestionOption } from './question-bank.repository.js';

/** La question figée. `Omit<QuestionOption, 'id'>` serait faux : l'écran élève a besoin d'identifiants stables pour désigner son choix. */
export interface FrozenQuestion {
  id: string;
  rank: number;
  questionId: string;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: AnswerMode;
  /** Le délai qui FAIT FOI (D10). `null` en mode contrôle. */
  timeLimitResolved: number | null;
  regles: ReglesDeSaisie;
  options: readonly QuestionOption[];
  acceptedAnswers: readonly string[];
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
}

export interface Participant {
  id: string;
  participantIndex: number;
  name: string | null;
  score: number;
  memberNames: readonly string[];
}

export interface Session {
  id: string;
  deckId: string;
  mode: SessionMode;
  status: SessionStatus;
  maxParticipants: number;
  joinCode: string;
  defaultTimeLimit: number | null;
  guestLocale: string | null;
  questions: readonly FrozenQuestion[];
  participants: readonly Participant[];
}

export interface NewAnswer {
  sessionQuestionId: string;
  participantId: string;
  authorGuestId: string;
  optionId: string | null;
  value: string | null;
  isCorrect: boolean;
  elapsedMs: number;
  points: number;
}

export interface AnswerRow extends NewAnswer {
  id: string;
}

export interface SessionRepository {
  create(input: {
    deckId: string;
    mode: SessionMode;
    maxParticipants: number;
    defaultTimeLimit: number | null;
    guestLocale: string | null;
    joinCode: string;
    createdBy: string;
  }): Promise<Session>;

  findById(sessionId: string): Promise<Session | null>;
  findByJoinCode(joinCode: string): Promise<Session | null>;
  list(): Promise<readonly Session[]>;

  setStatus(sessionId: string, status: SessionStatus): Promise<void>;

  /**
   * Fige les questions ET passe la séance `en-cours`, en une seule écriture :
   * une séance ouverte avec des questions figées ne pourrait plus démarrer
   * (l'unicité `(sessionId, rank)` refuserait le second figement). Un rang déjà
   * figé fait tout échouer ; une séance inconnue lève `SessionNotFoundError`.
   */
  demarrer(sessionId: string, questions: readonly Omit<FrozenQuestion, 'id'>[]): Promise<void>;

  openQuestion(input: {
    sessionQuestionId: string;
    openedAt: Date;
    deadlineAt: Date | null;
  }): Promise<void>;
  closeQuestion(input: { sessionQuestionId: string; closedAt: Date }): Promise<void>;

  /**
   * Le participant naît avec son premier membre, en une seule écriture : un
   * participant sans membre occuperait son index sans qu'aucune reconnexion
   * ne le retrouve.
   */
  ajouterParticipant(input: {
    sessionId: string;
    participantIndex: number;
    guestId: string;
    displayName: string;
  }): Promise<Participant>;
  findParticipantByGuest(input: {
    sessionId: string;
    guestId: string;
  }): Promise<Participant | null>;
  renameParticipant(input: { participantId: string; name: string | null }): Promise<void>;

  /**
   * Écrit la réponse ET ajoute `answer.points` au score, en une seule écriture.
   * Rend `null` quand le participant a déjà répondu (l'unicité vit en base),
   * score inchangé : un rejeu ne doit jamais compter deux fois, ni une
   * réponse écrite rester sans ses points.
   */
  enregistrerReponse(answer: NewAnswer): Promise<AnswerRow | null>;
  answersFor(sessionQuestionId: string): Promise<readonly AnswerRow[]>;
  allAnswers(sessionId: string): Promise<readonly AnswerRow[]>;
}
