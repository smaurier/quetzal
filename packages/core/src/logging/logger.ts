import pino, { type Logger } from 'pino';
import { tryGetCurrentTenant } from '../tenant/tenant-context';

const isDev = process.env['NODE_ENV'] !== 'production';

export const logger: Logger = pino({
  level: process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
  ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  mixin() {
    const ctx = tryGetCurrentTenant();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
      ...(ctx.userId !== undefined ? { userId: ctx.userId } : {}),
    };
  },
  redact: {
    paths: ['*.password', '*.token', 'req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]',
  },
});

export function redactUser(user: { id: string; email?: string }): { userIdHash: string } {
  return { userIdHash: user.id.slice(0, 8) };
}

export type { Logger };
