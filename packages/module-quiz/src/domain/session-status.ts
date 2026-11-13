export const SESSION_STATUSES = ['brouillon', 'ouverte', 'en-cours', 'terminee'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function isSessionStatus(valeur: string): valeur is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(valeur);
}

/**
 * Les transitions permises, écrites en table plutôt qu'en cascade de `if` : une
 * table se lit d'un coup d'œil, et un état oublié s'y voit.
 *
 * ⛔ `terminee` ne mène nulle part, et c'est délibéré : rouvrir une séance
 * ferait repartir un jeu dont le retour a peut-être déjà été lu et dont les
 * scores sont figés.
 *
 * ⛔ `ouverte -> terminee` et `brouillon -> terminee` sont permis, et ce n'est
 * pas un oubli : une animatrice qui change d'avis doit pouvoir clore sans jouer
 * une question. Les interdire laisserait des séances qu'aucun geste ne ferme.
 */
const TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  brouillon: ['ouverte', 'terminee'],
  ouverte: ['en-cours', 'terminee'],
  'en-cours': ['terminee'],
  terminee: [],
};

export function peutPasserA(depuis: SessionStatus, vers: SessionStatus): boolean {
  return TRANSITIONS[depuis].includes(vers);
}

/**
 * On rejoint une séance `ouverte`, comme on entre en classe avant le cours.
 *
 * ⛔ Et une séance `en-cours` aussi. La spec § 5.4 l'exige mot pour mot : « une
 * reconnexion aboutit toujours, même session commencée : sinon une coupure wifi
 * exclut un élève. » Le scénario de référence est un wifi d'établissement peu
 * fiable ; refuser ici viderait la classe au premier incident.
 */
export function peutRejoindre(statut: SessionStatus): boolean {
  return statut === 'ouverte' || statut === 'en-cours';
}
