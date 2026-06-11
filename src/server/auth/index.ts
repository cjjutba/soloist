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
import { sendResetPasswordEmail, sendVerificationEmail } from "./email";
import { buildTrustedOrigins } from "./trusted-origins";

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
  // Prod trusts ONLY our canonical origin (CSRF). Dev also trusts any localhost port, since the
  // Next dev port floats (3000/3001/3002…) — see buildTrustedOrigins. NEVER loosened in prod.
  trustedOrigins: buildTrustedOrigins(env.BETTER_AUTH_URL),

  emailAndPassword: {
    enabled: true,
    // The real enforcement of AC-2: an unverified user gets no usable session,
    // so the Tenant is unreachable until the email is confirmed.
    requireEmailVerification: true,
    minPasswordLength: 8,
    // Don't auto-sign-in right after sign-up: with requireEmailVerification, the post-signup
    // sign-in attempt hits the unverified account and RE-SENDS the verification email (the
    // duplicate). The user is signed in by `autoSignInAfterVerification` once they confirm.
    autoSignIn: false,
    // Password reset (built-in). Better Auth builds the reset `url`, stores a single-use
    // token, and equalizes the request-reset response whether or not the email exists (no
    // enumeration) — we only supply the transport. 1-hour token, same window as verification.
    sendResetPassword: async ({ user, url, token }) => {
      await sendResetPasswordEmail({ user, url, token });
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    // A password reset is the canonical "my account may be compromised" action, so it
    // logs out every other live session (CJ-approved during review — touches the spec's
    // Ask-First "session behavior" boundary).
    revokeSessionsOnPasswordReset: true,
  },

  // Session policy (Story 1.4): 7-day absolute expiry, 1-day sliding refresh.
  // NOTE: cookieCache is intentionally NOT enabled — every getSession re-validates
  // against the `session` table, so the role guard never trusts a stale cookie (AC-2).
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
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
    // Change-email (Story 1.7): Better Auth sends a verification to the NEW address via
    // emailVerification.sendVerificationEmail (already wired); the email updates only
    // after it's confirmed.
    changeEmail: { enabled: true },
  },

  // nextCookies MUST be the last plugin (handles Set-Cookie in Server Actions).
  plugins: [nextCookies()],
});
