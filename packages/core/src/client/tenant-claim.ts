import { decodeJwt } from 'jose';
import { apiClient } from './api-client.js';

/**
 * Reads the tenantId claim out of a JWT payload WITHOUT verifying its
 * signature — the browser has no business verifying a token it did not
 * mint, the server does that on every request that needs it. An expired
 * token still decodes fine: `exp` is never checked here, since a
 * stale-but-decodable tenantId is enough to build a join URL and any real
 * API call is re-verified server-side regardless. Returns null on a token
 * that cannot be parsed, or that carries no string tenantId claim, rather
 * than throwing. Never logs the token.
 */
export function tenantIdFromToken(token: string): string | null {
  try {
    const tenantId = decodeJwt(token)['tenantId'];
    return typeof tenantId === 'string' ? tenantId : null;
  } catch {
    return null;
  }
}

/**
 * Current tenant, read from the session JWT that `apiClient().getToken()`
 * already fetches (it carries the tenantId claim set at sign-in, see
 * packages/auth/src/config.ts). Platform-level: every module with a guest
 * entry builds the same `/j/<slug>/<sessionId>?tenantId=…` address.
 */
export async function getCurrentTenantId(
  getToken: () => Promise<string | null> = () => apiClient().getToken(),
): Promise<string | null> {
  const token = await getToken();
  if (token === null) return null;
  return tenantIdFromToken(token);
}
