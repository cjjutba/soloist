import { z } from "zod";

/**
 * Validated environment contract. Throws at import time if a required var is
 * missing or invalid — fail fast, never boot half-configured.
 *
 */
const schema = z.object({
  // Neon Postgres connection (pooled endpoint; serverless WebSocket driver).
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// connection string",
    ),

  // Better Auth (Story 1.3). SECRET signs sessions/tokens — keep ≥32 chars, per-env.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  // Canonical origin (single domain). Prod: https://soloist.cjjutba.com; dev: http://localhost:3000.
  BETTER_AUTH_URL: z.string().url(),

  // Email transport for verification (Story 1.3). Optional in dev — without a key,
  // sendVerificationEmail logs the link. EMAIL_FROM defaults to Resend's onboarding
  // sender, which works without domain verification (Epic 4.3 swaps in a branded domain).
  // An empty string (e.g. a copied `.env` template) coerces to the default — `.default()`
  // alone only fires when the var is ABSENT, so "" would otherwise slip through.
  RESEND_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  EMAIL_FROM: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().default("onboarding@resend.dev"),
  ),

  // Vercel Blob — Tenant logos (Story 1.6). Optional: the accent contrast guard works
  // without it; only logo upload needs it. Vercel auto-injects this when a Blob store
  // is linked to the project.
  BLOB_READ_WRITE_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),

  // Sentry server DSN (Story 1.7). Optional: no DSN → Sentry disabled. (The client DSN
  // NEXT_PUBLIC_SENTRY_DSN is read directly in instrumentation-client.ts.)
  SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),

  // GitHub App (Epic 3 — the Ship Feed moat). All optional/DSN-style so dev + build work
  // before the App is registered; the webhook handler fails CLOSED (rejects deliveries)
  // until GITHUB_APP_WEBHOOK_SECRET is set in prod. WEBHOOK_SECRET → HMAC verify (3.1);
  // PRIVATE_KEY/ID/CLIENT_ID → mint installation tokens + the install link (3.2/3.3).
  GITHUB_APP_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GITHUB_APP_WEBHOOK_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GITHUB_APP_PRIVATE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GITHUB_APP_CLIENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  GITHUB_APP_SLUG: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),

  // Inngest (Epic 3 — durable event pipeline). Optional for the build, but REQUIRED in prod:
  // Inngest defaults to cloud mode there, so `inngest.send` THROWS without an event key — the
  // webhook then 500s + Sentry-alerts and GitHub redelivers (the receiver rolls back its ledger
  // row so nothing is lost). Locally the Inngest dev server needs no keys.
  INNGEST_EVENT_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  INNGEST_SIGNING_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")} (${i.message})`)
    .join(", ");
  throw new Error(`❌ Invalid environment variables: ${missing}`);
}

export const env = parsed.data;
