import * as Sentry from "@sentry/nextjs";

// Next.js instrumentation hook — loads the runtime-appropriate Sentry config (the v8+
// Turbopack-compatible approach; the old sentry.*.config auto-load is gone).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors from Server Components, Server Actions, Route Handlers, and middleware.
export const onRequestError = Sentry.captureRequestError;
