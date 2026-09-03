import { describe, it, expect } from 'vitest';
import { InvalidGameTransitionError } from './errors.js';
import {
  GAME_STATUSES,
  assertTransition,
  canTransition,
  canJoin,
  canDraw,
  canClaim,
  type GameStatus,
} from './game-status.js';

describe('GAME_STATUSES', () => {
  it('énumère les quatre états de la spec', () => {
    expect([...GAME_STATUSES]).toEqual(['draft', 'open', 'running', 'finished']);
  });
});

describe('canTransition', () => {
  it('autorise le chemin nominal', () => {
    expect(canTransition('draft', 'open')).toBe(true);
    expect(canTransition('open', 'running')).toBe(true);
    expect(canTransition('running', 'finished')).toBe(true);
  });

  it('autorise l arrêt anticipé par l animatrice', () => {
    expect(canTransition('open', 'finished')).toBe(true);
  });

  it('interdit de sauter l ouverture', () => {
    expect(canTransition('draft', 'running')).toBe(false);
  });

  it('interdit tout retour en arrière', () => {
    expect(canTransition('running', 'open')).toBe(false);
    expect(canTransition('finished', 'running')).toBe(false);
    expect(canTransition('open', 'draft')).toBe(false);
  });

  it('interdit de rester sur place', () => {
    for (const s of GAME_STATUSES) expect(canTransition(s, s)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('ne lève rien sur une transition permise', () => {
    expect(() => assertTransition('draft', 'open')).not.toThrow();
  });

  it('lève une erreur de domaine sur une transition interdite', () => {
    expect(() => assertTransition('draft', 'finished' as GameStatus)).toThrow(InvalidGameTransitionError);
  });
});

describe('actions permises par état', () => {
  it('on ne rejoint qu une partie ouverte', () => {
    expect(canJoin('open')).toBe(true);
    expect(canJoin('draft')).toBe(false);
    expect(canJoin('running')).toBe(false);
    expect(canJoin('finished')).toBe(false);
  });

  it('on tire depuis une partie ouverte ou en cours', () => {
    expect(canDraw('open')).toBe(true);
    expect(canDraw('running')).toBe(true);
    expect(canDraw('draft')).toBe(false);
    expect(canDraw('finished')).toBe(false);
  });

  it('on ne réclame que dans une partie en cours', () => {
    expect(canClaim('running')).toBe(true);
    expect(canClaim('open')).toBe(false);
    expect(canClaim('finished')).toBe(false);
  });
});
