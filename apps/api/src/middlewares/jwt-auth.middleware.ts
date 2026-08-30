import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const hostUrl = process.env['HOST_URL'] ?? 'http://localhost:3000';
    const url = new URL(`${hostUrl}/api/auth/jwt/jwks`);
    jwks = createRemoteJWKSet(url, {
      cooldownDuration: 30_000,
      cacheMaxAge: 24 * 3600_000,
    });
  }
  return jwks;
}

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string | null;
  locale: string;
}

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return next();
    }
    const token = auth.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJwks());
      (req as Request & { authContext: AuthContext }).authContext = payload as unknown as AuthContext;
      next();
    } catch (err) {
      throw new UnauthorizedException(`JWT verification failed: ${(err as Error).message}`);
    }
  }
}
