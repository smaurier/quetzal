import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyGuestToken, type HandshakeVerifiers, type UserTokenClaims } from '@quetzal/core';
import { rootPrisma } from '@quetzal/db';
import { jwksUrl } from '../auth/jwks-url.js';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const hostUrl = process.env['HOST_URL'] ?? 'http://localhost:3000';
    jwks = createRemoteJWKSet(jwksUrl(hostUrl), { cooldownDuration: 30_000, cacheMaxAge: 24 * 3600_000 });
  }
  return jwks;
}

/**
 * The Better-Auth JWT carries no role (the organization plugin has no synchronous member
 * lookup), so the role is read from the membership at handshake time — once per connection.
 */
async function roleOf(userId: string, tenantId: string | null): Promise<string | undefined> {
  if (!tenantId) return undefined;
  const member = await rootPrisma.member.findFirst({
    where: { userId, organizationId: tenantId },
    select: { role: true },
  });
  return member?.role;
}

export const handshakeVerifiers: HandshakeVerifiers = {
  async verifyUserToken(token: string): Promise<UserTokenClaims> {
    const { payload } = await jwtVerify(token, getJwks());
    const userId = payload['userId'];
    if (typeof userId !== 'string') throw new Error('payload without userId');
    const tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'] : null;
    const locale = typeof payload['locale'] === 'string' ? payload['locale'] : undefined;
    return { userId, tenantId, role: await roleOf(userId, tenantId), locale };
  },
  verifyGuestToken,
};
