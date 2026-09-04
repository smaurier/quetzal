import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core/errors';
import {
  DeckTooSmallError,
  InvalidGameTransitionError,
  TeamBlockedError,
  GameNotRunningError,
  InvalidTeamLimitError,
  TablaGenerationExhaustedError,
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
