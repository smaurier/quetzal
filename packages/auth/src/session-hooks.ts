export interface SessionLike {
  userId: string;
  activeOrganizationId?: string | null;
  [key: string]: unknown;
}

export type FindFirstOrganizationId = (userId: string) => Promise<string | null>;

// Better-Auth databaseHooks.session.create.before: returning { data } replaces the row.
// Default the active organization to the user's first membership so the JWT payload
// (definePayload) carries a tenantId without a client-side organization.setActive call.
export function createSessionCreateHook(findFirstOrganizationId: FindFirstOrganizationId) {
  return async <S extends SessionLike>(session: S): Promise<{ data: S } | void> => {
    if (session.activeOrganizationId) return { data: session };
    const organizationId = await findFirstOrganizationId(session.userId);
    if (!organizationId) return;
    return { data: { ...session, activeOrganizationId: organizationId } };
  };
}
