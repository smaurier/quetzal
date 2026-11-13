interface PayloadInput {
  session: { activeOrganizationId?: string | null };
  user: { id: string; name?: string | null; locale?: string | null };
}

export interface QuetzalJwtPayload {
  userId: string;
  tenantId: string | null;
  locale: string;
  /**
   * Le nom affichable (#91). Il voyage dans le jeton pour que la plateforme le
   * pose dans le contexte : `User` est une table Better-Auth sans `tenantId`,
   * que le client cloisonné d'un module ne voit pas. Un changement de nom
   * n'apparaît qu'au renouvellement du jeton.
   */
  name?: string;
}

export function jwtPayload({ session, user }: PayloadInput): QuetzalJwtPayload {
  return {
    userId: user.id,
    tenantId: session.activeOrganizationId ?? null,
    locale: user.locale ?? 'fr',
    ...(user.name ? { name: user.name } : {}),
  };
}
