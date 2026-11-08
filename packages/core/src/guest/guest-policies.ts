import type { GuestAccessConfig } from '../module-contract.js';

/**
 * Ce que chaque module déclare sur ses invités, retenu au démarrage pour que
 * les routes du noyau puissent le lire.
 *
 * Il existe parce que le manifeste ne vit nulle part d'accessible : il est
 * chargé dans la variable locale de `bootstrap()` et passé à `buildWsRegistry`,
 * mais `GuestTokenController` appartient à `AppModule`, importé statiquement,
 * qui ne le voit pas.
 */
export interface GuestPolicies {
  register(moduleSlug: string, access: GuestAccessConfig | undefined): void;
  /** `null` quand le module n'accepte pas d'invités, ou n'a pas été enregistré. */
  forModule(moduleSlug: string): GuestAccessConfig | null;
}

export class InMemoryGuestPolicies implements GuestPolicies {
  private readonly bySlug = new Map<string, GuestAccessConfig>();

  register(moduleSlug: string, access: GuestAccessConfig | undefined): void {
    // Un module sans `guestAccess` n'est pas enregistré du tout, plutôt que
    // stocké comme `undefined` : `forModule` rend alors `null`, la seule forme
    // qu'`admitGuest` sait refuser proprement.
    if (access === undefined) return;
    this.bySlug.set(moduleSlug, access);
  }

  forModule(moduleSlug: string): GuestAccessConfig | null {
    return this.bySlug.get(moduleSlug) ?? null;
  }
}

/**
 * ⚠️ En mémoire, comme `guestRegistry` son voisin, et c'est cohérent plutôt que
 * négligent : le plafond est comparé à un compte lui aussi tenu en mémoire. Sur
 * plusieurs instances, les deux seraient par instance, donc le plafond vaudrait
 * N fois sa valeur. Render en plan gratuit n'en sert qu'une ; le jour où ce
 * n'est plus vrai, c'est le compte qu'il faut sortir d'ici, pas le plafond.
 */
export const guestPolicies: GuestPolicies = new InMemoryGuestPolicies();
