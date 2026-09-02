import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { jwksUrl } from '../auth/jwks-url';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const hostUrl = process.env['HOST_URL'] ?? 'http://localhost:3000';
    jwks = createRemoteJWKSet(jwksUrl(hostUrl));
  }
  return jwks;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<{ handshake?: { auth?: { token?: string } }; data?: Record<string, unknown> }>();
    const token = client.handshake?.auth?.token;
    if (!token) return false;
    try {
      const { payload } = await jwtVerify(token, getJwks());
      client.data = { ...(client.data ?? {}), ...payload };
      return true;
    } catch {
      return false;
    }
  }
}
