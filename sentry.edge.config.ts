import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry (Story 1.7). DSN-optional — disabled without SENTRY_DSN.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
