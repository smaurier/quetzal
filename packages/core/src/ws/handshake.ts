import type { QuetzalRole, PermissionMatrix } from '../module-contract.js';
import type { VerifiedGuestToken } from '../guest/guest-token.js';

export class WsUnauthenticatedError extends Error {
  constructor(reason: string) {
    super(`WebSocket handshake refused: ${reason}`);
    this.name = 'WsUnauthenticatedError';
  }
}

export interface HandshakeAuth {
  /** Better-Auth JWT of a signed-in user. */
  token?: string;
  /** Signed guest token minted by POST /api/guest-token. */
  guestToken?: string;
}

/** What a module namespace accepts, derived from its manifest. */
export interface NamespacePolicy {
  moduleSlug: string;
  allowGuests: boolean;
}

export interface UserTokenClaims {
  userId: string;
  tenantId: string | null;
  role?: string | undefined;
  locale?: string | undefined;
}

export interface HandshakeVerifiers {
  verifyUserToken(token: string): Promise<UserTokenClaims>;
  verifyGuestToken(token: string): Promise<VerifiedGuestToken>;
}

export type SocketIdentity =
  | { role: 'guest'; guestId: string; displayName: string; tenantId: string; sessionId: string; moduleSlug: string }
  | { role: QuetzalRole; userId: string; tenantId: string | null; locale: string };

/**
 * Identify the party opening a module namespace, once, at handshake time.
 * A user token always wins: an invalid one is a refusal, never a fallback to guest.
 */
export async function resolveSocketIdentity(
  auth: HandshakeAuth,
  policy: NamespacePolicy,
  verifiers: HandshakeVerifiers,
): Promise<SocketIdentity> {
  if (auth.token) {
    let claims: UserTokenClaims;
    try {
      claims = await verifiers.verifyUserToken(auth.token);
    } catch (err) {
      throw new WsUnauthenticatedError(`user token rejected (${(err as Error).message})`);
    }
    return {
      role: (claims.role ?? 'learner') as QuetzalRole,
      userId: claims.userId,
      tenantId: claims.tenantId,
      locale: claims.locale ?? 'fr',
    };
  }

  if (auth.guestToken) {
    if (!policy.allowGuests) throw new WsUnauthenticatedError(`module ${policy.moduleSlug} does not accept guests`);
    let payload: VerifiedGuestToken;
    try {
      payload = await verifiers.verifyGuestToken(auth.guestToken);
    } catch (err) {
      throw new WsUnauthenticatedError(`guest token rejected (${(err as Error).message})`);
    }
    if (payload.moduleSlug !== policy.moduleSlug) {
      throw new WsUnauthenticatedError(`guest token issued for module ${payload.moduleSlug}`);
    }
    return {
      role: 'guest',
      guestId: payload.guestId,
      displayName: payload.displayName,
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
      moduleSlug: payload.moduleSlug,
    };
  }

  throw new WsUnauthenticatedError('no token');
}

/**
 * Per-message authorization against the manifest matrix. Fail closed: an event that the
 * manifest does not declare under `ws:<event>` is refused for everyone.
 */
export function canEmitWsEvent(permissions: PermissionMatrix, event: string, role: QuetzalRole): boolean {
  const allowed = permissions[`ws:${event}`];
  return Array.isArray(allowed) && allowed.includes(role);
}
