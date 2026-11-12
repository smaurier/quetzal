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
