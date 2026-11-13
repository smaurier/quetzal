import type { UserTokenClaims } from '@quetzal/core';

/** Le rôle n'est pas dans le jeton : il est lu sur l'adhésion, à part. */
export type ClaimsWithoutRole = Omit<UserTokenClaims, 'role'>;

export function claimsFromPayload(payload: Readonly<Record<string, unknown>>): ClaimsWithoutRole {
  const userId = payload['userId'];
  // Repris tel quel du vérificateur : resolveSocketIdentity enveloppe toute
  // erreur ici dans un WsUnauthenticatedError.
  if (typeof userId !== 'string') throw new Error('payload without userId');
  const locale = payload['locale'];
  const name = payload['name'];
  return {
    userId,
    tenantId: typeof payload['tenantId'] === 'string' ? payload['tenantId'] : null,
    ...(typeof locale === 'string' ? { locale } : {}),
    ...(typeof name === 'string' ? { name } : {}),
  };
}
