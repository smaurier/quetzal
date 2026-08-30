import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { logger, TenantScopeViolationError } from '@quetzal/core';

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
