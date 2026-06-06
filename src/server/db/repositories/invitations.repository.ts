import { eq, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../context";
import { invitations } from "../schema";

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
