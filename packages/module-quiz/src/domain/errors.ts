import { DomainError } from '@quetzal/core';
import type { AnswerMode } from './answer-mode.js';

export class BankNotFoundError extends DomainError {
  constructor(bankId: string) {
    super(`Banque de questions introuvable : ${bankId}`);
  }
}

export class QuestionNotFoundError extends DomainError {
  constructor(questionId: string) {
    super(`Question introuvable : ${questionId}`);
  }
}

/** La raison, pas seulement le mode : « choix » seul n'aide personne à corriger. */
export class InvalidQuestionShapeError extends DomainError {
  constructor(mode: AnswerMode, raison: string) {
    super(`Forme de question invalide en mode ${mode} : ${raison}`);
  }
}

export class SessionNotFoundError extends DomainError {
  constructor(sessionId: string) {
    super(`Séance introuvable : ${sessionId}`);
  }
}

/** La transition demandée, nommée : « invalide » seul n'aide personne. */
export class InvalidSessionTransitionError extends DomainError {
  constructor(depuis: string, vers: string) {
    super(`Transition de séance refusée : ${depuis} vers ${vers}`);
  }
}

export class SessionClosedToJoinError extends DomainError {
  constructor(statut: string) {
    super(`On ne rejoint pas une séance dans l'état ${statut}`);
  }
}

export class SessionFullError extends DomainError {
  constructor(maxParticipants: number) {
    super(`Séance complète : ${String(maxParticipants)} participants`);
  }
}

export class NoQuestionOpenError extends DomainError {
  constructor(sessionId: string) {
    super(`Aucune question ouverte sur la séance ${sessionId}`);
  }
}

export class AnswerTooLateError extends DomainError {
  constructor(raison: string) {
    super(`Réponse refusée : ${raison}`);
  }
}

export class AlreadyAnsweredError extends DomainError {
  constructor(participantId: string) {
    super(`Le participant ${participantId} a déjà répondu à cette question`);
  }
}

export class TimeLimitUnresolvableError extends DomainError {
  constructor(rank: number, raison: string) {
    super(`Délai impossible à résoudre pour la question ${String(rank)} : ${raison}`);
  }
}
