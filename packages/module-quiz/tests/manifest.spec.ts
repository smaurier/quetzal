import { describe, it, expect } from 'vitest';
import { runContractSuite } from '@quetzal/core/testing/index';
import { resolve } from 'node:path';
import { manifest } from '../src/manifest.js';

runContractSuite(manifest, { moduleRoot: resolve(import.meta.dirname, '..') });

const ROUTES_DE_SEANCE = Object.entries(manifest.permissions).filter(([cle]) =>
  cle.startsWith('http:') && cle.includes('/api/modules/quiz/sessions'));

describe('manifeste du quiz, la seance', () => {
  it('declare les onze routes de seance', () => {
    expect(ROUTES_DE_SEANCE).toHaveLength(11);
  });

  /** Piloter la séance est un geste d'animatrice : l'écran est projeté devant la classe. */
  it.each(ROUTES_DE_SEANCE)('reserve %s a owner et creator', (_cle, roles) => {
    expect([...roles].sort()).toEqual(['creator', 'owner']);
  });

  it('fait de ws:answer le seul message entrant, ouvert aux invites et aux eleves', () => {
    const messages = Object.keys(manifest.permissions).filter((cle) => cle.startsWith('ws:'));
    expect(messages).toEqual(['ws:answer']);
    expect([...(manifest.permissions['ws:answer'] ?? [])].sort()).toEqual(['guest', 'learner']);
  });

  it('accepte les invites, jusqu a 60 par seance', () => {
    expect(manifest.guestAccess?.enabled).toBe(true);
    expect(manifest.guestAccess?.maxConcurrentPerSession).toBe(60);
  });

  it('declare les cinq evenements que les cas d usage emettent', () => {
    expect(manifest.eventsPublished.map((e) => e.name).sort()).toEqual([
      'quiz.answer.recorded',
      'quiz.question.closed',
      'quiz.question.opened',
      'quiz.session.finished',
      'quiz.session.started',
    ]);
  });
});
