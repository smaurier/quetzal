import { describe, it, expect } from 'vitest';
import type { GuestAccessConfig } from '../module-contract.js';
import { InMemoryGuestPolicies } from './guest-policies.js';

const LOTO: GuestAccessConfig = {
  enabled: true,
  tokenTTL: 7200,
  requireDisplayName: true,
  maxConcurrentPerSession: 60,
};

/**
 * Le registre existe parce que le manifeste ne vit nulle part d'accessible : il
 * est charge dans la variable locale de `bootstrap()` (apps/api/src/main.ts) et
 * passe a `buildWsRegistry`, mais `GuestTokenController` est un controleur de
 * `AppModule`, importe statiquement, qui ne le voit pas.
 *
 * Meme forme que `guestRegistry`, son voisin : un singleton en memoire peuple
 * au demarrage. ⚠️ Il a donc la meme limite, et c'est acceptable parce que
 * `guestRegistry` compte en memoire lui aussi : sur plusieurs instances, le
 * compte ET le plafond sont par instance. Render en plan gratuit n'en sert
 * qu'une.
 */
describe('InMemoryGuestPolicies', () => {
  it('rend la politique enregistree', () => {
    const politiques = new InMemoryGuestPolicies();
    politiques.register('loto', LOTO);

    expect(politiques.forModule('loto')).toEqual(LOTO);
  });

  /**
   * ⛔ LE PIEGE. `manifest.guestAccess` vaut `undefined` quand le module n'en
   * declare pas, alors qu'`admitGuest` attend `null` pour refuser. Rendre
   * `undefined` ferait que `access === null` est faux, donc que la garde
   * d'`admitGuest` ne joue pas et que le module passe a `!access.enabled` sur
   * `undefined` : une levee au lieu d'un refus propre.
   *
   * ⚠️ Ce test garde le `?? null` de `forModule`, et RIEN D'AUTRE. Le retour
   * anticipe de `register` n'est pas tenu par lui : mesure faite, le retirer
   * laisse ce test vert et fait rougir le TYPECHECK (TS2345, `undefined` non
   * assignable a la valeur de la Map). Deux gardes, deux outils, et il vaut
   * mieux le dire que laisser croire qu'un test couvre les deux.
   */
  it('rend null et non undefined pour un module sans acces invite', () => {
    const politiques = new InMemoryGuestPolicies();
    politiques.register('neuro', undefined);

    expect(politiques.forModule('neuro')).toBeNull();
  });

  it('rend null pour un module jamais enregistre', () => {
    expect(new InMemoryGuestPolicies().forModule('jamais-vu')).toBeNull();
  });

  it('ne confond pas deux modules', () => {
    const politiques = new InMemoryGuestPolicies();
    const hello: GuestAccessConfig = { ...LOTO, maxConcurrentPerSession: 100 };
    politiques.register('loto', LOTO);
    politiques.register('hello', hello);

    expect(politiques.forModule('loto')?.maxConcurrentPerSession).toBe(60);
    expect(politiques.forModule('hello')?.maxConcurrentPerSession).toBe(100);
  });

  /**
   * Un redemarrage a chaud, ou un test qui enregistre deux fois, ne doit pas
   * empiler deux politiques pour le meme module : la derniere lue au demarrage
   * est celle du manifeste charge, donc celle qui fait foi.
   */
  it('remplace la politique d un module deja enregistre', () => {
    const politiques = new InMemoryGuestPolicies();
    politiques.register('loto', LOTO);
    politiques.register('loto', { ...LOTO, maxConcurrentPerSession: 12 });

    expect(politiques.forModule('loto')?.maxConcurrentPerSession).toBe(12);
  });
});
