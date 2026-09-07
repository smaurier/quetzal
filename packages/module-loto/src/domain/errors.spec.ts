import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core/errors';
import {
  DeckTooSmallError,
  InvalidGameTransitionError,
  TeamBlockedError,
  GameNotRunningError,
  InvalidTeamLimitError,
  TablaGenerationExhaustedError,
  DeckNotFoundError,
  GameNotFoundError,
  JoinCodeUnavailableError,
  NoCardsLeftError,
  DeckLockedError,
  CardNotOnTablaError,
  TeamNotFoundError,
  TeamIndexCollisionError,
} from './errors.js';

describe('erreurs du domaine loto', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckTooSmallError(9)).toBeInstanceOf(DomainError);
    expect(new InvalidGameTransitionError('draft', 'finished')).toBeInstanceOf(DomainError);
    expect(new TeamBlockedError(15)).toBeInstanceOf(DomainError);
    expect(new GameNotRunningError('open')).toBeInstanceOf(DomainError);
    expect(new InvalidTeamLimitError(0)).toBeInstanceOf(DomainError);
    expect(new TablaGenerationExhaustedError(6, 100)).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe, pour que le filtre global les distingue', () => {
    expect(new DeckTooSmallError(9).name).toBe('DeckTooSmallError');
    expect(new InvalidTeamLimitError(0).name).toBe('InvalidTeamLimitError');
    expect(new TablaGenerationExhaustedError(6, 100).name).toBe('TablaGenerationExhaustedError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckTooSmallError(9).message).toContain('9');
    expect(new DeckTooSmallError(9).message).toContain('16');
    expect(new InvalidGameTransitionError('draft', 'finished').message).toContain('draft');
    expect(new TeamBlockedError(15).message).toContain('15');
    expect(new InvalidTeamLimitError(0).message).toContain('0');
    expect(new InvalidTeamLimitError(-1).message).toContain('-1');
    expect(new TablaGenerationExhaustedError(6, 100).message).toContain('6');
    expect(new TablaGenerationExhaustedError(6, 100).message).toContain('100');
  });
});

describe('erreurs des cas d usage', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckNotFoundError('d-1')).toBeInstanceOf(DomainError);
    expect(new GameNotFoundError('g-1')).toBeInstanceOf(DomainError);
    expect(new JoinCodeUnavailableError(20)).toBeInstanceOf(DomainError);
    expect(new NoCardsLeftError('g-1')).toBeInstanceOf(DomainError);
    expect(new DeckLockedError('d-1')).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe', () => {
    expect(new DeckLockedError('d-1').name).toBe('DeckLockedError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckNotFoundError('d-1').message).toContain('d-1');
    expect(new GameNotFoundError('g-1').message).toContain('g-1');
    expect(new JoinCodeUnavailableError(20).message).toContain('20');
    expect(new NoCardsLeftError('g-1').message).toContain('g-1');
    expect(new DeckLockedError('d-1').message).toContain('d-1');
  });

  it('couvre aussi la carte hors tabla et l équipe inconnue', () => {
    expect(new CardNotOnTablaError('c-9')).toBeInstanceOf(DomainError);
    expect(new TeamNotFoundError('t-9')).toBeInstanceOf(DomainError);
    expect(new CardNotOnTablaError('c-9').message).toContain('c-9');
    expect(new TeamNotFoundError('t-9').message).toContain('t-9');
  });

  it('signale la collision d index d équipe, pour que le cas d usage la distingue d une vraie panne', () => {
    const err = new TeamIndexCollisionError('g-1', 0);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe('TeamIndexCollisionError');
    expect(err.message).toContain('g-1');
    expect(err.message).toContain('0');
  });
});
