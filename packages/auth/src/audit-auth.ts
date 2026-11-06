/**
 * Les lignes de journal d audit de l authentification (issue #60).
 *
 * Pourquoi le host écrit lui-même au lieu d émettre un événement : le bus est
 * in-process (`CLAUDE.md` §6), Better-Auth vit ici, et l abonné d audit vit
 * dans l autre processus. `AuditSubscriber` écoutait `user.login` depuis des
 * mois sans que personne ne puisse le lui envoyer. Le précédent de l écriture
 * directe existe déjà : `apps/api/src/guest/guest-token.controller.ts`.
 *
 * Ces deux fonctions sont pures : elles décident du contenu, et le crochet
 * qui les appelle fait l écriture. C est ce qui les rend testables, et c est
 * aussi ce qui permet de prouver qu aucun PII n en sort.
 */

/** Ce qu une ligne d audit porte, hors `id` et `createdAt` que la base pose. */
export interface LigneAudit {
  tenantId: string | null;
  userId: string | null;
  action: string;
  target: string | null;
}

interface SessionCreee {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
}

interface UtilisateurCree {
  id: string;
}

/**
 * ⚠️ On ne recopie JAMAIS l objet reçu. Better-Auth passe la session complète,
 * qui porte l adresse, l empreinte du navigateur et l IP ; `CLAUDE.md` §13
 * interdit le PII dans les journaux. On ne prend donc que des identifiants,
 * champ par champ, et il n y a pas de `metadata` — rien à y mettre qui ne soit
 * déjà une colonne, et tout ce qu on y mettrait serait une fuite en puissance.
 */
export function auditConnexion(session: SessionCreee): LigneAudit {
  return {
    tenantId: session.activeOrganizationId ?? null,
    userId: session.userId,
    action: 'user.login',
    // La session, et non l utilisateur : deux connexions du même compte
    // doivent se distinguer, sinon le journal ne sert à rien le jour où on
    // cherche d où venait un accès.
    target: session.id,
  };
}

/**
 * À l inscription, aucun locataire n existe encore : l appartenance est créée
 * après, et c est le crochet de session qui la trouvera à la première
 * connexion. Une ligne sans `tenantId` est donc correcte ici, pas incomplète.
 */
export function auditInscription(utilisateur: UtilisateurCree): LigneAudit {
  return {
    tenantId: null,
    userId: utilisateur.id,
    action: 'user.signup',
    target: utilisateur.id,
  };
}
