import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { invitations, type Invitation } from "../schema";

/** Single source of truth for "is this invite still acceptable" (Story 2.4): exists, not yet
 * accepted, not expired. Used by BOTH the /invite page (gate the form) and the accept flow
 * (re-validate the credential at submit) — one predicate so the two can't drift. */
export function isInvitationAcceptable(inv: Invitation | null): inv is Invitation {
  return !!inv && !inv.acceptedAt && inv.expiresAt.getTime() > Date.now();
}

/**
 * PRE-AUTH lookup by token hash (Story 2.4) — the ONE sanctioned RLS bypass. The invitee
 * has no session (no Tenant scope to set), so this CANNOT go through `withTenant`. It runs
 * as the connection role (`neondb_owner`, BYPASSRLS) → bypasses RLS even under FORCE, which
 * is exactly what's needed. Safe because the key is the unguessable 256-bit `token_hash`
 * (never email/engagement — those would enumerate). Returns the row or null; the caller MUST
 * still validate `expires_at > now()` AND `accepted_at IS NULL`.
 */
export async function findInvitationByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Create or replace the Engagement's invitation (Story 2.3). `engagement_id` is UNIQUE, so
 * a resend/re-invite updates the single row in place — new token hash + expiry, and
 * `accepted_at` reset to null (a fresh invite supersedes any prior state). `tenant_id` is
 * always stamped from `ctx` (never trusted from input). */
export async function upsertInvitation(
  ctx: TenantContext,
  input: { engagementId: string; email: string; tokenHash: string; expiresAt: Date },
) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(invitations)
      .values({
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        email: input.email,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: invitations.engagementId,
        set: {
          email: input.email,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          acceptedAt: null,
          // Re-stamp so the Cockpit's "Invited <relative>" reflects THIS (re)issue, not the
          // original send. The row IS the current invite (token rotated).
          createdAt: sql`now()`,
        },
      })
      .returning();
    return row ?? null;
  });
}

/** The Engagement's invitation (RLS-scoped → null if not the caller's, or none yet). */
export async function getInvitationByEngagement(ctx: TenantContext, engagementId: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.engagementId, engagementId))
      .limit(1);
    return row ?? null;
  });
}
