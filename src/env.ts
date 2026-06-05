import { z } from "zod";

/**
 * Validated environment contract. Throws at import time if a required var is
 * missing or invalid — fail fast, never boot half-configured.
 *
 * Story 1.1 is path-based on a single domain, so routing needs NO env vars.
 * The schema is intentionally empty now; later stories EXTEND it as they
 * introduce variables that actually have a value:
 *   - DATABASE_URL                         → Story 1.2 (Neon + Drizzle)
 *   - BETTER_AUTH_SECRET                   → Story 1.3 (auth)
 *   - GITHUB_APP_* / RESEND_API_KEY /
 *     INNGEST_* / BLOB_READ_WRITE_TOKEN    → later epics
 */
const schema = z.object({
  // (no required variables yet — later stories add them here)
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")} (${i.message})`)
    .join(", ");
  throw new Error(`❌ Invalid environment variables: ${missing}`);
}

export const env = parsed.data;
