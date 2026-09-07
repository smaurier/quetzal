import { describe, it, expect } from 'vitest';
import {
  LotoGameStartedEvent,
  LotoCardDrawnEvent,
  LotoClaimRejectedEvent,
  LotoGameFinishedEvent,
} from '@quetzal/core/events/loto';

describe('contrat des événements loto', () => {
  it('expose les quatre noms de type annoncés par le manifeste', () => {
    expect(LotoGameStartedEvent).toBe('LotoGameStartedEvent');
    expect(LotoCardDrawnEvent).toBe('LotoCardDrawnEvent');
    expect(LotoClaimRejectedEvent).toBe('LotoClaimRejectedEvent');
    expect(LotoGameFinishedEvent).toBe('LotoGameFinishedEvent');
  });
});
