import * as Sentry from "@sentry/nextjs";

// Server-side Sentry (Story 1.7, AR-15). DSN-optional: without SENTRY_DSN the SDK is
// disabled — no errors in local dev / CI / before a Sentry project is connected.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
