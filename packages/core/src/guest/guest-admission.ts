import type { GuestAccessConfig } from '../module-contract.js';

/**
 * Pourquoi un refus porte un CODE et non une phrase : il traverse l'API, puis
 * le réseau, puis arrive sur le téléphone d'un élève, où il doit être traduit
 * dans sa langue. Une phrase écrite ici serait une phrase française servie à
 * tout le monde.
 */
export type GuestRefusalCode = 'guests_not_allowed' | 'guest_session_full';

export type GuestAdmission =
  | { kind: 'admitted' }
  | { kind: 'refused'; code: GuestRefusalCode; max?: number };

/**
 * Un invité peut-il entrer dans cette séance ? Issue #75.
 *
 * Pure, sans registre et sans base : elle reçoit la politique du module et le
 * nombre d'invités déjà présents, et rend une décision. C'est ce qui la rend
 * testable en entier, là où le contrôleur qui l'appelle signe un jeton, écrit
 * un journal d'audit et émet un événement.
 *
 * ⛔ `access` à `null` signifie « on ne connaît pas le manifeste de ce module »,
 * et c'est un REFUS, jamais une absence de plafond. Un module non enregistré au
 * démarrage accueillerait sinon tout le monde sans limite, soit exactement le
 * défaut que cette issue corrige.
 */
export function admitGuest(
  access: GuestAccessConfig | null,
  dejaPresents: number,
): GuestAdmission {
  if (access === null || !access.enabled) {
    return { kind: 'refused', code: 'guests_not_allowed' };
  }

  // `>=` et non `>` : au moment de la décision, l'invité qui demande n'est pas
  // encore compté. Avec `>`, le plafond vaudrait une place de plus que ce que
  // le manifeste annonce, et personne ne le verrait.
  if (dejaPresents >= access.maxConcurrentPerSession) {
    return {
      kind: 'refused',
      code: 'guest_session_full',
      max: access.maxConcurrentPerSession,
    };
  }

  return { kind: 'admitted' };
}
