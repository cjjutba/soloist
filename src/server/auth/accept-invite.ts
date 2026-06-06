import { headers } from "next/headers";
import { acceptInvitationTx } from "@/server/db/repositories/client-access.repository";
import {
  findInvitationByTokenHash,
  isInvitationAcceptable,
} from "@/server/db/repositories/invitations.repository";
import { hashToken } from "@/server/invitations/token";
import { auth } from "./index";
import { deleteUserById, userExistsByEmail } from "./users";

/** One NEUTRAL reason for any invalid token (expired / unknown / already-accepted) — never
 * distinguish them to the client (AC-2, no account disclosure). `email-taken` is a distinct,
 * actionable case (v1 ships the new-Client path only). */
export type AcceptInviteResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "email-taken" | "error" };

/**
 * Accept a client invite (Story 2.4). Lives in the auth infra layer (like sign-up.ts) so it
 * can use the Better Auth internal adapter + the sanctioned RLS-bypass repository reads.
 *
 * Order: validate token (unexpired + unaccepted) → reject an existing email → create a
 * VERIFIED Client User + credential (the token is the email proof, so NO verification email)
 * → ClientAccess + stamp the invitation (one scoped tx) → sign in. On any post-create
 * failure, delete the orphan user so a retry isn't blocked by the existing-email guard.
 */
export async function acceptInvite(input: {
  token: string;
  password: string;
  name?: string;
}): Promise<AcceptInviteResult> {
  const inv = await findInvitationByTokenHash(hashToken(input.token));
  // Single-use + unexpired (one shared predicate with the /invite page). One neutral outcome
  // for missing / expired / already-accepted — no disclosure (AC-2).
  if (!isInvitationAcceptable(inv)) {
    return { ok: false, reason: "invalid" };
  }

  // Normalize to match Better Auth's stored (lowercased) email — keeps the existing-email
  // guard and createUser aligned even if a row ever held mixed case.
  const email = inv.email.toLowerCase();
  if (await userExistsByEmail(email)) {
    return { ok: false, reason: "email-taken" };
  }

  // Create the verified Client User + credential via the Better Auth internal adapter (no
  // verification email — the invite token already proved the address).
  let userId = "";
  try {
    const ctx = await auth.$context;
    const hashed = await ctx.password.hash(input.password);
    const created = await ctx.internalAdapter.createUser({
      email,
      name: input.name?.trim() || email.split("@")[0],
      emailVerified: true,
    });
    userId = created.id;
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hashed,
    });
  } catch (err) {
    console.error("[accept-invite] user creation failed:", err);
    // If createUser succeeded but createAccount threw, delete the orphan (no credential)
    // user — else its row trips the existing-email guard and permanently blocks the retry.
    if (userId) await deleteUserById(userId);
    return { ok: false, reason: "error" };
  }

  // Grant access + stamp the invitation, scoped by the VALIDATED invitation (never the request).
  try {
    await acceptInvitationTx(
      { tenantId: inv.tenantId, engagementId: inv.engagementId, userId, role: "client" },
      { engagementId: inv.engagementId, userId, invitedAt: inv.createdAt },
    );
  } catch (err) {
    console.error("[accept-invite] access tx failed:", err);
    await deleteUserById(userId); // orphan cleanup — else the email-taken guard blocks retry
    return { ok: false, reason: "error" };
  }

  // Sign in (allowed now — emailVerified). nextCookies sets the session cookie.
  try {
    await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: await headers(),
    });
  } catch (err) {
    // The account + access exist; they can log in manually. Don't delete (that would orphan
    // a valid ClientAccess). Surface a neutral error.
    console.error("[accept-invite] sign-in failed:", err);
    return { ok: false, reason: "error" };
  }

  return { ok: true };
}
