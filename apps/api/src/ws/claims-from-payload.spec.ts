import { describe, it, expect } from 'vitest';
import { claimsFromPayload } from './claims-from-payload';

/**
 * Le vérificateur WS recopie champ par champ ce qu'il lit dans le jeton. Un
 * champ qu'il ne recopie pas n'atteint jamais le contexte, et les tests du
 * handshake ne le voient pas : ils simulent le vérificateur (#91).
 */
describe('claimsFromPayload', () => {
  it('lit le nom de l utilisateur', () => {
    expect(claimsFromPayload({ userId: 'u1', tenantId: 't1', locale: 'es', name: 'Elda' }))
      .toEqual({ userId: 'u1', tenantId: 't1', locale: 'es', name: 'Elda' });
  });

  it('omet ce que le jeton ne porte pas, au lieu de le mettre a undefined', () => {
    const claims = claimsFromPayload({ userId: 'u1' });
    expect(claims).toEqual({ userId: 'u1', tenantId: null });
  });

  it('ignore un nom qui n est pas une chaine', () => {
    expect('name' in claimsFromPayload({ userId: 'u1', name: 42 })).toBe(false);
  });

  it('refuse un jeton sans utilisateur', () => {
    expect(() => claimsFromPayload({ tenantId: 't1' })).toThrow(/userId/);
  });
});
