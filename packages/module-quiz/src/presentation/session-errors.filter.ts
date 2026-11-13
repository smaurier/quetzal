import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { DomainError } from '@quetzal/core';
import {
  AlreadyAnsweredError,
  AnswerTooLateError,
  BankNotFoundError,
  EmptyBankError,
  InvalidSessionTransitionError,
  JoinCodeAlreadyUsedError,
  NoQuestionLeftError,
  NoQuestionOpenError,
  ParticipantNotFoundError,
  SessionBankDeletedError,
  SessionClosedToJoinError,
  SessionFullError,
  SessionNotFoundError,
  TimeLimitUnresolvableError,
} from '../domain/errors.js';

const INTROUVABLES = [SessionNotFoundError, BankNotFoundError, ParticipantNotFoundError];

// 409, comme `guest_session_full` du jeton invité : la demande est légitime, le
// refus tient à l'état de la séance ou de sa banque, et il peut se lever.
const EN_CONFLIT = [
  InvalidSessionTransitionError,
  EmptyBankError,
  SessionBankDeletedError,
  TimeLimitUnresolvableError,
  NoQuestionLeftError,
  NoQuestionOpenError,
  JoinCodeAlreadyUsedError,
  SessionFullError,
  SessionClosedToJoinError,
  AlreadyAnsweredError,
  AnswerTooLateError,
];

function codeDe(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * Le filtre global d'`apps/api` répond 400 à toute `DomainError` et ne connaît
 * aucune classe de module. Celui-ci ne change que le STATUT des erreurs de
 * séance ; le corps garde la forme du global, que les écrans traduisent.
 * Les erreurs non listées tombent toujours sur le global.
 */
@Catch(...INTROUVABLES, ...EN_CONFLIT)
export class SessionErrorsFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): unknown {
    const response = host
      .switchToHttp()
      .getResponse<{ status: (code: number) => { json: (body: unknown) => unknown } }>();
    const statut = INTROUVABLES.some((classe) => exception instanceof classe)
      ? HttpStatus.NOT_FOUND
      : HttpStatus.CONFLICT;
    return response.status(statut).json({ error: codeDe(exception.name), message: exception.message });
  }
}
