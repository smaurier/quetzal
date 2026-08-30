import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env['SENTRY_DSN_API'];
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    environment: process.env['NODE_ENV'] ?? 'development',
    beforeSend(event) {
      if (event.user) {
        const id = event.user.id;
        event.user = id === undefined ? {} : { id };
      }
      if (event.request?.cookies) event.request.cookies = { redacted: '[REDACTED]' };
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        delete headers['authorization'];
        delete headers['cookie'];
      }
      return event;
    },
  });
}
