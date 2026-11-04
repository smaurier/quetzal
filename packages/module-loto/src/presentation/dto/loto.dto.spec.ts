import { describe, it, expect } from 'vitest';
import { createGameSchema } from './loto.dto.js';

const base = { deckId: 'd-1', patterns: ['linea'], maxTeams: 6, falseClaimPenaltyDraws: 0 };

describe('createGameSchema, langue de partie', () => {
  it('accepte une langue connue', () => {
    expect(createGameSchema.safeParse({ ...base, guestLocale: 'es' }).success).toBe(true);
  });

  it("accepte l'absence de langue : l'option est décochée", () => {
    expect(createGameSchema.safeParse(base).success).toBe(true);
    expect(createGameSchema.safeParse({ ...base, guestLocale: null }).success).toBe(true);
  });

  it('refuse une langue inconnue', () => {
    // La validation ne peut pas vivre uniquement dans le middleware : celui-ci
    // protège l'affichage, pas ce qu'on écrit en base.
    expect(createGameSchema.safeParse({ ...base, guestLocale: 'de' }).success).toBe(false);
    expect(createGameSchema.safeParse({ ...base, guestLocale: '"><script>' }).success).toBe(false);
  });
});
