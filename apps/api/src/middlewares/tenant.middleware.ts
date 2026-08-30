import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { tenantStore } from '@quetzal/core';
import type { AuthContext } from './jwt-auth.middleware';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const augmented = req as Request & { authContext?: AuthContext; requestId: string };
    const auth = augmented.authContext;
    const requestId = augmented.requestId;
    if (!auth || !auth.tenantId) return next();

    tenantStore.run(
      {
        tenantId: auth.tenantId,
        userId: auth.userId,
        ...(auth.role ? { role: auth.role as never } : {}),
        ...(auth.locale ? { locale: auth.locale as never } : {}),
        requestId,
      },
      () => next(),
    );
  }
}
