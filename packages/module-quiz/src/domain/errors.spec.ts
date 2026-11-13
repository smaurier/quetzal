import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core';
import {
  BankNotFoundError,
  QuestionNotFoundError,
  InvalidQuestionShapeError,
  SessionNotFoundError,
  InvalidSessionTransitionError,
  SessionClosedToJoinError,
  SessionFullError,
  NoQuestionOpenError,
  AnswerTooLateError,
  AlreadyAnsweredError,
  TimeLimitUnresolvableError,
  JoinCodeAlreadyUsedError,
  ParticipantIndexTakenError,
} from './errors';

/**
 * CLAUDE.md §14 interdit `throw new Error('...')` : chaque erreur de domaine est
 * une classe typée. Ce test existe pour qu'on ne puisse pas en ajouter une qui
 * oublie d'hériter, le filtre d'exception global de l'API mappe sur
 * `DomainError`, donc une erreur qui n'en hérite pas sortirait en 500.
 */
describe('erreurs du domaine quiz', () => {
  const toutes = [
    new BankNotFoundError('b-1'),
    new QuestionNotFoundError('q-1'),
    new InvalidQuestionShapeError('choix', 'une seule proposition'),
    new SessionNotFoundError('s-1'),
    new InvalidSessionTransitionError('terminee', 'ouverte'),
    new SessionClosedToJoinError('terminee'),
    new SessionFullError(30),
    new NoQuestionOpenError('s-1'),
    new AnswerTooLateError('delai depasse'),
    new AlreadyAnsweredError('p-1'),
    new TimeLimitUnresolvableError(2, 'aucun delai'),
    new JoinCodeAlreadyUsedError('ABCD1234'),
    new ParticipantIndexTakenError(3),
  ];

  it('heritent toutes de DomainError', () => {
    for (const erreur of toutes) expect(erreur).toBeInstanceOf(DomainError);
  });

  it('portent chacune son identifiant dans le message, pour etre diagnosticables', () => {
    expect(new BankNotFoundError('b-42').message).toContain('b-42');
    expect(new QuestionNotFoundError('q-42').message).toContain('q-42');
  });

  it('nomment la transition refusee, pas seulement son echec', () => {
    const erreur = new InvalidSessionTransitionError('terminee', 'ouverte');
    expect(erreur.message).toContain('terminee');
    expect(erreur.message).toContain('ouverte');
  });

  it('nomment la raison pour une forme invalide, pas seulement le mode', () => {
    const erreur = new InvalidQuestionShapeError('choix', 'une seule proposition');
    expect(erreur.message).toContain('choix');
    expect(erreur.message).toContain('une seule proposition');
  });

  it('portent chacune un nom de classe distinct, que la passerelle renvoie', () => {
    // La passerelle du loto renvoie `err.name` au client, et l'écran le traduit.
    // Deux erreurs au même nom seraient indiscernables côté élève.
    const noms = toutes.map((e) => e.name);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
