export const rooms = {
  session: (moduleSlug: string, sessionId: string) => `${moduleSlug}:session:${sessionId}` as const,
  tenant:  (moduleSlug: string, tenantId: string)  => `${moduleSlug}:tenant:${tenantId}` as const,
};
