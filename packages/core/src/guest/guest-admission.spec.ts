import { describe, it, expect } from 'vitest';
import type { GuestAccessConfig } from '../module-contract.js';
import { admitGuest } from './guest-admission.js';

const OUVERT: GuestAccessConfig = {
  enabled: true,
  tokenTTL: 7200,
  requireDisplayName: true,
  maxConcurrentPerSession: 3,
};

/**
 * Issue #75 : `maxConcurrentPerSession` etait declare dans le contrat, valide
 * par le schema Zod, pose a 40 dans `module-loto`, et lu par PERSONNE. La
 * mesure de #32 le prouve : soixante invites sont entres sur une partie dont le
 * manifeste annoncait quarante, zero refuse.
 *
 * La regle vit ici, pure, et non dans le controleur : le controleur signe un
 * jeton, ecrit un journal d audit et emet un evenement, donc il ne se teste pas
 * sans une vraie base (CLAUDE.md §11 interdit de mocker Prisma). Sortie d ici,
 * la decision se teste en entier.
 */
describe('admitGuest', () => {
  it('admet quand la seance est vide', () => {
    expect(admitGuest(OUVERT, 0)).toEqual({ kind: 'admitted' });
  });

  it('admet le dernier invite que le plafond autorise', () => {
    expect(admitGuest(OUVERT, 2)).toEqual({ kind: 'admitted' });
  });

  /**
   * ⛔ LA BORNE, et c est la seule ligne qui compte vraiment. Un `>` au lieu
   * d un `>=` laisse entrer un invite de trop : le plafond devient 4 alors que
   * le manifeste annonce 3, et rien ne le dirait.
   */
  it('refuse des que le plafond est atteint, et non une place plus tard', () => {
    expect(admitGuest(OUVERT, 3)).toEqual({
      kind: 'refused',
      code: 'guest_session_full',
      max: 3,
    });
  });

  it('refuse au-dela du plafond', () => {
    expect(admitGuest(OUVERT, 40)).toEqual({
      kind: 'refused',
      code: 'guest_session_full',
      max: 3,
    });
  });

  /**
   * ⛔ Un module inconnu est un module dont on n a PAS lu le manifeste, pas un
   * module sans plafond. Rendre « admis » ici ferait qu un module absent du
   * deploiement, ou un registre non peuple au demarrage, accueillerait tout le
   * monde sans limite, exactement le defaut que cette issue corrige.
   */
  it('refuse quand aucune politique n est connue pour le module', () => {
    expect(admitGuest(null, 0)).toEqual({ kind: 'refused', code: 'guests_not_allowed' });
  });

  /**
   * `guestAccess.enabled` n etait verifie qu au handshake WebSocket
   * (`resolveSocketIdentity`, policy.allowGuests), donc la route signait un
   * jeton qui ne pourrait jamais se connecter, en ecrivant quand meme un
   * journal d audit, un evenement, et une entree au registre.
   */
  it('refuse quand le module n accepte pas les invites', () => {
    const ferme: GuestAccessConfig = { ...OUVERT, enabled: false };
    expect(admitGuest(ferme, 0)).toEqual({ kind: 'refused', code: 'guests_not_allowed' });
  });

  it('refuse un plafond a zero, qui est une fermeture et non un oubli', () => {
    const aucune: GuestAccessConfig = { ...OUVERT, maxConcurrentPerSession: 0 };
    expect(admitGuest(aucune, 0)).toEqual({
      kind: 'refused',
      code: 'guest_session_full',
      max: 0,
    });
  });

  /**
   * Le code de refus voyage jusqu a l ecran de l eleve, qui le traduit. Deux
   * refus au meme code seraient indiscernables sur son telephone, et c est la
   * meme lecon que `joinErrorMessage` du loto a tiree : l ecran affichait
   * « GameNotRunningError » a un eleve de collège.
   */
  it('distingue les deux refus par leur code', () => {
    const pleine = admitGuest(OUVERT, 3);
    const fermee = admitGuest(null, 0);
    expect(pleine.kind === 'refused' && fermee.kind === 'refused').toBe(true);
    expect(pleine.kind === 'refused' ? pleine.code : null).not.toBe(
      fermee.kind === 'refused' ? fermee.code : null,
    );
  });

  /**
   * Le plafond ne sert a rien si l appelant ne peut pas dire a l eleve combien
   * de places il y avait. `max` n est donc pas decoratif, et il porte la valeur
   * du manifeste, pas le nombre de presents.
   */
  it('rend le plafond du manifeste, pour que le message puisse le nommer', () => {
    const refus = admitGuest(OUVERT, 10);
    expect(refus.kind === 'refused' ? refus.max : undefined).toBe(3);
  });
});
