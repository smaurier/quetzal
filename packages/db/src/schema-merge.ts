/**
 * Pure helpers used by scripts/merge-schemas.ts to patch the Better-Auth generated
 * Prisma schema before it is merged with core.prisma and the module schemas.
 */

/**
 * Inject back-relation fields into Better-Auth generated models.
 * core.prisma declares FKs from AuditLog → User and TenantModule → Organization;
 * Prisma requires the inverse side to also declare the relation field.
 */
export function injectBackRelations(authSchema: string): string {
  let out = authSchema;
  out = out.replace(
    /(model\s+User\s*\{[^}]*?)(\n\s*@@[^}]*\})/s,
    (_m, body: string, tail: string) => `${body}\n  auditLogs     AuditLog[]${tail}`,
  );
  out = out.replace(
    /(model\s+Organization\s*\{[^}]*?)(\n\s*@@[^}]*\})/s,
    (_m, body: string, tail: string) => `${body}\n  tenantModules TenantModule[]${tail}`,
  );
  return out;
}

/**
 * Inject @@unique([userId, organizationId]) into the Better-Auth Member model.
 * The Better-Auth CLI omits it, but the seed and any admin flow need it to upsert safely.
 */
export function injectMemberUnique(authSchema: string): string {
  return authSchema.replace(
    /(model\s+Member\s*\{[^}]*?)(\n\s*@@map\("member"\)\s*\})/s,
    (_m, body: string, tail: string) => `${body}\n  @@unique([userId, organizationId])${tail}`,
  );
}
