import { describe, it, expect } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
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
import { SessionErrorsFilter } from './session-errors.filter.js';

function hoteQuiCapture() {
  const capture: { status?: number; body?: unknown } = {};
  const reponse = {
    status(code: number) {
      capture.status = code;
      return {
        json(body: unknown) {
          capture.body = body;
          return body;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reponse, getRequest: () => ({ url: '/x' }) }),
  } as unknown as ArgumentsHost;
  return { host, capture };
}

/**
 * Le corps a la MÊME forme que celle du filtre global d'`apps/api`
 * (`{ error, message }`, `error` en snake_case du nom de classe) : l'écran
 * traduit le code, il ne lit jamais le statut seul. Seul le statut change.
 */
const ATTENDUS = [
  [new SessionNotFoundError('s'), 404, 'session_not_found_error'],
  [new BankNotFoundError('b'), 404, 'bank_not_found_error'],
  [new ParticipantNotFoundError('p'), 404, 'participant_not_found_error'],
  [new InvalidSessionTransitionError('terminee', 'ouverte'), 409, 'invalid_session_transition_error'],
  [new EmptyBankError('b'), 409, 'empty_bank_error'],
  [new SessionBankDeletedError('s'), 409, 'session_bank_deleted_error'],
  [new TimeLimitUnresolvableError(1, 'aucun-delai'), 409, 'time_limit_unresolvable_error'],
  [new NoQuestionLeftError('s'), 409, 'no_question_left_error'],
  [new NoQuestionOpenError('s'), 409, 'no_question_open_error'],
  [new JoinCodeAlreadyUsedError('ABCD1234'), 409, 'join_code_already_used_error'],
  [new SessionFullError(60), 409, 'session_full_error'],
  [new SessionClosedToJoinError('terminee'), 409, 'session_closed_to_join_error'],
  [new AlreadyAnsweredError('p'), 409, 'already_answered_error'],
  [new AnswerTooLateError('trop-tard'), 409, 'answer_too_late_error'],
] as const;

describe('SessionErrorsFilter', () => {
  it.each(ATTENDUS)('traduit %o en %i, code %s', (erreur, statut, code) => {
    const { host, capture } = hoteQuiCapture();

    new SessionErrorsFilter().catch(erreur, host);

    expect(capture.status).toBe(statut);
    expect(capture.body).toEqual({ error: code, message: erreur.message });
  });

  /** Trois refus du démarrage ou de la suite que l'écran doit dire différemment. */
  it('donne trois codes distincts a banque vide, banque supprimee et plus de question', () => {
    const codes = [new EmptyBankError('b'), new SessionBankDeletedError('s'), new NoQuestionLeftError('s')]
      .map((erreur) => {
        const { host, capture } = hoteQuiCapture();
        new SessionErrorsFilter().catch(erreur, host);
        return (capture.body as { error: string }).error;
      });
    expect(new Set(codes).size).toBe(3);
  });
});
