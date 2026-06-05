import { z } from "zod";

/**
 * Validated environment contract. Throws at import time if a required var is
 * missing or invalid — fail fast, never boot half-configured (Story 1.1, AC2).
 *
 * KEPT MINIMAL on purpose. Story 1.1 only needs the domain vars below. Later
 * stories EXTEND this schema as they introduce variables that actually have a
 * value in the environment:
 *   - DATABASE_URL                         → Story 1.2 (Neon + Drizzle)
 *   - BETTER_AUTH_SECRET                   → Story 1.3 (auth)
 *   - GITHUB_APP_* / RESEND_API_KEY /
 *     INNGEST_* / BLOB_READ_WRITE_TOKEN    → later epics
 * Do NOT add them before they have a value, or boot fails fast for no benefit.
 */
const schema = z.object({
  /** Apex domain the app is served under, e.g. `cjjutba.com` (or `localhost` in dev). */
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1),
  /** Reserved subdomain that serves the Cockpit back-office. */
  NEXT_PUBLIC_COCKPIT_SUBDOMAIN: z.string().min(1).default("soloist"),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_COCKPIT_SUBDOMAIN: process.env.NEXT_PUBLIC_COCKPIT_SUBDOMAIN,
});

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")} (${i.message})`)
    .join(", ");
  throw new Error(`❌ Invalid environment variables: ${missing}`);
}

export const env = parsed.data;
