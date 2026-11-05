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

describe('createGameSchema, liste de figures', () => {
  it('accepte une liste a une entree', () => {
    expect(createGameSchema.safeParse({ ...base, patterns: ['linea'] }).success).toBe(true);
  });

  it('accepte deux figures distinctes et conserve leur ordre', () => {
    // L ordre est celui voulu par l animatrice : rien d autre ne le garde
    // avant la base, donc le schema doit le laisser passer intact.
    const result = createGameSchema.safeParse({ ...base, patterns: ['llena', 'linea'] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.patterns).toEqual(['llena', 'linea']);
  });

  it('refuse une liste vide', () => {
    expect(createGameSchema.safeParse({ ...base, patterns: [] }).success).toBe(false);
  });

  it('refuse un doublon', () => {
    expect(createGameSchema.safeParse({ ...base, patterns: ['linea', 'linea'] }).success).toBe(false);
  });

  it('refuse une liste de cinq entrees', () => {
    expect(
      createGameSchema.safeParse({ ...base, patterns: ['linea', 'esquinas', 'centro', 'llena', 'linea'] }).success,
    ).toBe(false);
  });

  it('refuse une cle inconnue', () => {
    expect(createGameSchema.safeParse({ ...base, patterns: ['inexistante'] }).success).toBe(false);
  });
});
