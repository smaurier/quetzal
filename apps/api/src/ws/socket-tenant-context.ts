import type { SocketIdentity, TenantExecutionContext, Locale } from '@quetzal/core';

const LOCALES: readonly Locale[] = ['fr', 'en', 'es'];

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Tenant context a WS connection should run under, built once from the identity the
 * handshake resolved (`resolveSocketIdentity`). `undefined` when no tenant id can be
 * trusted — an authenticated user with no org (`tenantId: null`). Mirrors
 * `TenantMiddleware` on the HTTP side: the connection is still accepted, but a handler
 * that reaches a tenant-scoped repository fails closed with `TenantContextMissingError`
 * instead of guessing a tenant.
 */
export function buildSocketTenantContext(
  identity: SocketIdentity,
  requestId: string,
): TenantExecutionContext | undefined {
  if ('guestId' in identity) {
    return { tenantId: identity.tenantId, role: identity.role, requestId };
  }
  if (identity.tenantId === null) return undefined;
  return {
    tenantId: identity.tenantId,
    userId: identity.userId,
    role: identity.role,
    requestId,
    ...(isLocale(identity.locale) ? { locale: identity.locale } : {}),
  };
}
