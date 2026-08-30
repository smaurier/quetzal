import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

export interface GuestTokenPayload {
  tenantId: string;
  sessionId: string;
  guestId: string;
  displayName: string;
  moduleSlug: string;
}

export interface VerifiedGuestToken extends GuestTokenPayload {
  iat: number;
  exp: number;
}

export class GuestTokenInvalidError extends Error {
  constructor(reason: string) {
    super(`Guest token invalid: ${reason}`);
    this.name = 'GuestTokenInvalidError';
  }
}

function getSecret(): Uint8Array {
  const secret = process.env['GUEST_TOKEN_SECRET'];
  if (!secret || secret.length < 32) throw new Error('GUEST_TOKEN_SECRET missing or too short (min 32 chars)');
  return new TextEncoder().encode(secret);
}

export async function signGuestToken(payload: GuestTokenPayload, ttlSeconds: number): Promise<string> {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

export async function verifyGuestToken(token: string): Promise<VerifiedGuestToken> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload as unknown as VerifiedGuestToken;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw new GuestTokenInvalidError('expired');
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) throw new GuestTokenInvalidError('bad signature');
    throw new GuestTokenInvalidError((err as Error).message);
  }
}
