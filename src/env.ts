import { z } from "zod";

/**
 * Validated environment contract. Throws at import time if a required var is
 * missing or invalid — fail fast, never boot half-configured.
 *
 * Later stories extend this schema:
 *   - BETTER_AUTH_SECRET                   → Story 1.3 (auth)
 *   - GITHUB_APP_* / RESEND_API_KEY /
 *     INNGEST_* / BLOB_READ_WRITE_TOKEN    → later epics
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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")} (${i.message})`)
    .join(", ");
  throw new Error(`❌ Invalid environment variables: ${missing}`);
}

export const env = parsed.data;
