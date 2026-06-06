import * as Sentry from "@sentry/nextjs";

// Client-side Sentry (Story 1.7). DSN-optional via NEXT_PUBLIC_SENTRY_DSN (inlined at
// build) — disabled when unset, so it never breaks the client bundle.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// Instrument client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
