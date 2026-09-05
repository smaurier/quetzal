import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { logger, TenantScopeViolationError, TenantContextMissingError, DomainError } from '@quetzal/core';

function toErrorCode(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): unknown {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status: (code: number) => { json: (body: unknown) => unknown } }>();
    const request = ctx.getRequest<{ url?: string }>();

    if (exception instanceof TenantScopeViolationError) {
      logger.error({ err: exception, path: request.url }, 'tenant scope violation');
      Sentry.captureException(exception);
      return response.status(HttpStatus.FORBIDDEN).json({
        error: 'tenant_scope_violation',
        message: 'Cross-tenant access denied',
      });
    }

    if (exception instanceof TenantContextMissingError) {
      logger.warn({ path: request.url }, 'request without tenant context');
      return response.status(HttpStatus.UNAUTHORIZED).json({
        error: 'tenant_context_missing',
        message: 'No active organization on this session',
      });
    }

    if (exception instanceof DomainError) {
      // Une règle métier violée est une requête invalide, pas une panne : ni
      // 500, ni Sentry. Le message du domaine est écrit pour être lu.
      logger.warn({ err: exception, path: request.url }, 'domain rule violated');
      return response.status(HttpStatus.BAD_REQUEST).json({
        error: toErrorCode(exception.name),
        message: exception.message,
      });
    }

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    logger.error({ err: exception, path: request.url }, 'unhandled exception');
    Sentry.captureException(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
    });
  }
}
