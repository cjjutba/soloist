import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Better Auth is a server-only package that DYNAMICALLY imports optional native
  // adapters (bun/node/D1 sqlite via kysely) it never uses with our pg/Drizzle setup.
  // Bundling it makes Turbopack statically trace those branches and choke on the
  // kysely sqlite dialect (kysely 0.29 dropped a constant it references). Marking it
  // external leaves it as a runtime import from node_modules — the unused sqlite path
  // is never loaded (we use pg), so the broken import is never reached.
  serverExternalPackages: ["better-auth", "@better-auth/kysely-adapter"],
  // Tenant logo upload goes through a Server Action (≤1MB); the default 1MB cap is tight
  // once form overhead is added, so allow a little headroom (Story 1.6).
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

// Sentry (Story 1.7). Source-map upload only runs when SENTRY_AUTH_TOKEN is present;
// otherwise this just enables the error-capture wiring. DSN-optional (see sentry.*.config).
export default withSentryConfig(nextConfig, {
  // Quiet by default — without an auth token (no source-map upload) the plugin would
  // otherwise warn on every CI build for no actionable reason.
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
