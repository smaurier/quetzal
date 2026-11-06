import { describe, it, expect } from 'vitest';
import { auditConnexion, auditInscription } from './audit-auth.js';

/**
 * Issue #60 : le journal d audit n enregistrait AUCUNE authentification.
 *
 * `AuditSubscriber` écoutait `user.login`, `user.logout` et `user.signup`, mais
 * ces noms n avaient aucun émetteur — et ne pouvaient pas en avoir : le bus est
 * in-process (`CLAUDE.md` §6), Better-Auth vit dans le host, et host et API
 * sont deux processus. Un `emit` depuis les hooks n atteindrait jamais l abonné.
 *
 * Ces deux constructeurs sont donc purs et le host écrit la ligne lui-même, ce
 * qui a déjà un précédent dans ce dépôt : `guest-token.controller.ts` écrit
 * `rootPrisma.auditLog.create` en direct.
 *
 * ⚠️ `CLAUDE.md` §13 : « Aucun PII : email/IP redacted ». Un journal
 * d authentification est précisément l endroit où une adresse se glisse sans
 * qu on y pense — d où le test le plus important de ce fichier, le dernier.
 */

describe('auditConnexion', () => {
  it('porte l action, l utilisateur et son locataire', () => {
    const ligne = auditConnexion({
      id: 's-1',
      userId: 'u-1',
      activeOrganizationId: 'org-1',
    });

    expect(ligne.action).toBe('user.login');
    expect(ligne.userId).toBe('u-1');
    expect(ligne.tenantId).toBe('org-1');
  });

  it('vise la session, pour qu une ligne se rattache a un acces precis', () => {
    expect(auditConnexion({ id: 's-42', userId: 'u-1', activeOrganizationId: 'org-1' }).target).toBe('s-42');
  });

  it('accepte une session sans locataire actif', () => {
    // Un compte sans appartenance : le hook d organisation n a rien trouve.
    // La ligne doit exister quand meme, c est une connexion reelle.
    const ligne = auditConnexion({ id: 's-1', userId: 'u-1', activeOrganizationId: null });
    expect(ligne.tenantId).toBeNull();
    expect(ligne.action).toBe('user.login');
  });
});

describe('auditInscription', () => {
  it('porte l action et le nouvel utilisateur', () => {
    const ligne = auditInscription({ id: 'u-9' });
    expect(ligne.action).toBe('user.signup');
    expect(ligne.userId).toBe('u-9');
    expect(ligne.target).toBe('u-9');
  });

  it('n a pas de locataire : il n existe pas encore a l inscription', () => {
    expect(auditInscription({ id: 'u-9' }).tenantId).toBeNull();
  });
});

describe('aucun PII ne fuit dans le journal (CLAUDE.md §13)', () => {
  const COURRIEL = 'elda@exemple.test';

  it('une adresse presente dans la session ne ressort nulle part', () => {
    const ligne = auditConnexion({
      id: 's-1',
      userId: 'u-1',
      activeOrganizationId: 'org-1',
      // Better-Auth passe l objet complet : tout ce qu il contient est un
      // risque de fuite si on le recopie sans filtrer.
      email: COURRIEL,
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    } as Parameters<typeof auditConnexion>[0]);

    expect(JSON.stringify(ligne)).not.toContain(COURRIEL);
    expect(JSON.stringify(ligne)).not.toContain('203.0.113.7');
    expect(JSON.stringify(ligne)).not.toContain('Mozilla');
  });

  it('une adresse presente sur l utilisateur ne ressort nulle part', () => {
    const ligne = auditInscription({ id: 'u-9', email: COURRIEL, name: 'Elda' } as Parameters<
      typeof auditInscription
    >[0]);

    expect(JSON.stringify(ligne)).not.toContain(COURRIEL);
    expect(JSON.stringify(ligne)).not.toContain('Elda');
  });
});
