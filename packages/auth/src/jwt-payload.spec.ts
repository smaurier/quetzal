import { describe, it, expect } from 'vitest';
import { jwtPayload } from './jwt-payload';

/**
 * Le nom de l'utilisateur voyage dans le jeton (#91), pour que la plateforme
 * le pose dans le contexte d'exécution sans qu'aucun module lise la table
 * `User`, que le client cloisonné ne voit pas.
 */
describe('jwtPayload', () => {
  const user = { id: 'u1', name: 'Elda', locale: 'es' };

  it('porte le nom de l utilisateur', () => {
    expect(jwtPayload({ session: { activeOrganizationId: 'org-1' }, user }).name).toBe('Elda');
  });

  it('garde les revendications existantes', () => {
    expect(jwtPayload({ session: { activeOrganizationId: 'org-1' }, user })).toEqual({
      userId: 'u1',
      tenantId: 'org-1',
      locale: 'es',
      name: 'Elda',
    });
  });

  it('rend un locataire nul et la langue par defaut quand ils manquent', () => {
    const payload = jwtPayload({ session: {}, user: { id: 'u1', name: 'Elda' } });
    expect(payload.tenantId).toBeNull();
    expect(payload.locale).toBe('fr');
  });
});
