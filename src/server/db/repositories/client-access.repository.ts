import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { clientAccess, invitations, user } from "../schema";

/** Thrown when the invitation was already consumed by a concurrent/replayed accept — the
 * conditional stamp matched 0 rows, so the whole tx rolls back (single-use is atomic). */
export class InvitationAlreadyAcceptedError extends Error {
  constructor() {
    super("invitation already accepted");
    this.name = "InvitationAlreadyAcceptedError";
  }
}

/**
 * SCOPE-RESOLUTION bootstrap (Story 2.4). `getAppSession` must read `ClientAccess` to LEARN
 * a Client's `(tenantId, engagementId)` BEFORE any scope exists — a chicken-and-egg that
 * cannot go through `withTenant`. So this is a raw `db` read (connection role bypasses RLS).
 * Safe: it is keyed on the authenticated session's OWN `userId` (a session can only ever
 * resolve its own access). `user_id` is UNIQUE → at most one row.
 */
export async function findClientAccessByUserId(userId: string) {
  const [row] = await db
    .select()
    .from(clientAccess)
    .where(eq(clientAccess.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Find the Client recipient for an Engagement (Story 3.6 fan-out): the one Client who accepted
 * the invite (engagement_id is UNIQUE → at most one), joined to `user` for the email. Raw `db`
 * (the Inngest fan-out has no session); SAFE because it is keyed on the trusted published-event's
 * `engagementId`, never request input. Returns null if no Client has accepted yet — the fan-out
 * then no-ops (the feed still shows the update once they join).
 */
export async function findClientRecipientForEngagement(engagementId: string) {
  const [row] = await db
    .select({
      userId: clientAccess.userId,
      email: user.email,
      name: user.name,
      // The per-Client global notification on/off (Story 4.4) — the fan-out gates on it.
      notificationsEnabled: clientAccess.notificationsEnabled,
    })
    .from(clientAccess)
    .innerJoin(user, eq(user.id, clientAccess.userId))
    .where(eq(clientAccess.engagementId, engagementId))
    .limit(1);
  return row ?? null;
}

export type ClientRecipient = NonNullable<
  Awaited<ReturnType<typeof findClientRecipientForEngagement>>
>;

/** Why a notification fan-out did/should proceed for an Engagement — the shared, event-agnostic
 * gate result. `no-recipient` = no Client has accepted yet; `muted` = a Client opted out (4.4). */
export type NotifiableResolution =
  | { status: "ok"; recipient: ClientRecipient }
  | { status: "no-recipient" }
  | { status: "muted" };

/**
 * Resolve whether — and to whom — a notification should fire for an Engagement (Story 4.4): the
 * single **event-agnostic** gate for the whole notification fan-out. It folds the recipient lookup
 * and the per-Client mute together so NO event handler ever duplicates the pref logic. A future
 * event (Epic 5 `invoice_sent`) calls THIS, then `createNotification({ type, shipUpdateId })` on
 * `status === "ok"` — that is the "same fan-out" genericity (AC-1).
 */
export async function resolveNotifiableRecipient(
  engagementId: string,
): Promise<NotifiableResolution> {
  const recipient = await findClientRecipientForEngagement(engagementId);
  if (!recipient) return { status: "no-recipient" };
  if (!recipient.notificationsEnabled) return { status: "muted" };
  return { status: "ok", recipient };
}

/**
 * Set the Client's global notification preference (Story 4.4). Scoped (RLS restricts to the
 * caller's engagement) AND filtered by `engagement_id` defensively — the exact shape as
 * `markOnboarded`. A freelancer ctx has no engagement → no-op (a freelancer must never own this).
 */
export async function setNotificationsEnabled(ctx: TenantContext, enabled: boolean): Promise<void> {
  const engagementId = ctx.engagementId;
  if (!engagementId) return; // client ctx only
  await withTenant(ctx, async (tx) => {
    await tx
      .update(clientAccess)
      .set({ notificationsEnabled: enabled })
      .where(eq(clientAccess.engagementId, engagementId));
  });
}

/**
 * Stamp the Client's one-time Onboarding as complete (Story 2.5). Scoped (RLS restricts to
 * the caller's engagement) AND filtered by `engagement_id` defensively. The `IS NULL` guard
 * makes it idempotent — a double-tap or a re-fire is a no-op.
 */
export async function markOnboarded(ctx: TenantContext): Promise<void> {
  const engagementId = ctx.engagementId;
  if (!engagementId) return; // client ctx only (a freelancer ctx has none)
  await withTenant(ctx, async (tx) => {
    await tx
      .update(clientAccess)
      .set({ onboardedAt: sql`now()` })
      .where(and(eq(clientAccess.engagementId, engagementId), isNull(clientAccess.onboardedAt)));
  });
}

/**
 * Accept an invite atomically (Story 2.4): in ONE transaction, INSERT the `ClientAccess`
 * grant AND stamp `invitations.accepted_at`. `ctx` is the INVITATION-DERIVED scope
 * (`{ tenantId, engagementId, userId, role:"client" }`) — both writes satisfy their
 * dual-scope WITH CHECK under it (the tenant/engagement come from the validated invitation,
 * never the request).
 */
export async function acceptInvitationTx(
  ctx: TenantContext,
  input: { engagementId: string; userId: string; invitedAt: Date | null },
) {
  return withTenant(ctx, async (tx) => {
    // Consume the invite FIRST, conditionally: stamp accepted_at only if still unconsumed.
    // 0 rows → a concurrent/replayed accept already took it → throw → the whole tx (incl. the
    // access insert below) rolls back. This makes single-use ATOMIC, not reliant on a sibling
    // UNIQUE collision surfacing later.
    const stamped = await tx
      .update(invitations)
      .set({ acceptedAt: sql`now()` })
      .where(and(eq(invitations.engagementId, input.engagementId), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (stamped.length === 0) {
      throw new InvitationAlreadyAcceptedError();
    }
    const [access] = await tx
      .insert(clientAccess)
      .values({
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        userId: input.userId,
        invitedAt: input.invitedAt,
      })
      .returning();
    return access;
  });
}
