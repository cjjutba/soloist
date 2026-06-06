import { z } from "zod";

/**
 * Validated environment contract. Throws at import time if a required var is
 * missing or invalid — fail fast, never boot half-configured.
 *
 * Later stories extend this schema:
 *   - GITHUB_APP_* / INNGEST_* / BLOB_READ_WRITE_TOKEN → later epics
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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")} (${i.message})`)
    .join(", ");
  throw new Error(`❌ Invalid environment variables: ${missing}`);
}

export const env = parsed.data;
