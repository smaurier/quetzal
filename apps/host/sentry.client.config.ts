import * as Sentry from '@sentry/nextjs';

const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN_HOST'];
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (event.user) {
        const id = event.user.id;
        event.user = id === undefined ? {} : { id };
      }
      return event;
    },
  });
}
