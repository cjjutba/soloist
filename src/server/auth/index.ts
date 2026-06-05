import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/env";
// Auth is an infra layer (peer to src/server/db) — it legitimately owns the raw
// Drizzle adapter + db handle. The ESLint no-restricted-imports guard exempts
// src/server/auth/** for exactly this reason.
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { activateTenant } from "@/server/db/repositories/tenants.repository";
import { sendVerificationEmail } from "./email";

/**
 * Better Auth — email/password CORE only (no organization plugin; the Tenant is the
 * custom `tenants` table, owned via owner_user_id — see Story 1.3 / architecture
 * "Authentication & Security"). The auth tables (user/session/account/verification)
 * carry NO RLS and are queried as the connection role.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Single-domain: only our canonical origin is trusted (CSRF / origin checks).
  trustedOrigins: [env.BETTER_AUTH_URL],

  emailAndPassword: {
    enabled: true,
    // The real enforcement of AC-2: an unverified user gets no usable session,
    // so the Tenant is unreachable until the email is confirmed.
    requireEmailVerification: true,
    minPasswordLength: 8,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail,
    // Lifecycle marker: stamp tenants.activated_at once the owner verifies.
    afterEmailVerification: async (user) => {
      const tenantId = (user as { tenantId?: string | null }).tenantId;
      if (tenantId) await activateTenant(user.id, tenantId);
    },
  },

  // Forward link to the owned Tenant. input:false → set server-side at provisioning,
  // never from client input; included in the session user (read by the 1.4 role guard).
  user: {
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
    },
  },

  // nextCookies MUST be the last plugin (handles Set-Cookie in Server Actions).
  plugins: [nextCookies()],
});
