import { and, desc, eq, gt, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { clientAccess, engagements, messages, type Message } from "../schema";

export type { Message };

/** A message sender — who authored a row (v1 is strictly 1 freelancer ↔ 1 client per engagement). */
export type ChatSenderRole = "freelancer" | "client";

const LIST_LIMIT = 500; // newest N (the thread is rendered oldest→newest; v1 has no infinite scroll)

/**
 * Create a chat message (realtime slice 3). RLS-scoped via `withTenant`: a client ctx sets
 * `app.engagement_id`, so the `message_scope` WITH CHECK pins the row to their one engagement; a
 * freelancer ctx sets only `app.tenant_id`, so the check gates ONLY tenant_id — which is why the
 * freelancer SEND ACTION must `getEngagement`-guard the engagementId (mirrors createCandidate).
 */
export async function createMessage(
  ctx: TenantContext,
  input: { engagementId: string; senderRole: ChatSenderRole; body: string },
): Promise<Message> {
  const id = uuidv7();
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        id,
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        senderRole: input.senderRole,
        senderUserId: ctx.userId,
        body: input.body,
      })
      .returning();
    return row;
  });
}

/**
 * The engagement's message thread, oldest→newest (RLS-scoped + an explicit `engagement_id` filter
 * so a freelancer — whose RLS is tenant-wide — gets only this engagement's thread). Capped at the
 * newest `LIST_LIMIT` (fetched desc, then reversed to chronological).
 */
export async function listMessages(ctx: TenantContext, engagementId: string): Promise<Message[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select()
      .from(messages)
      .where(eq(messages.engagementId, engagementId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(LIST_LIMIT),
  );
  return rows.reverse();
}

/** Stamp the Client's chat read cursor (client ctx only — RLS-scoped to their own engagement).
 * Always updates ("last" read). A freelancer ctx (no engagementId) no-ops. */
export async function markChatReadAsClient(ctx: TenantContext): Promise<void> {
  const engagementId = ctx.engagementId;
  if (!engagementId) return;
  await withTenant(ctx, async (tx) => {
    await tx
      .update(clientAccess)
      .set({ chatLastReadAt: sql`now()` })
      .where(eq(clientAccess.engagementId, engagementId));
  });
}

/** Stamp the Freelancer's chat read cursor for one engagement (RLS tenant-scoped → a foreign
 * engagement matches 0 rows; the send/read action also `getEngagement`-guards). */
export async function markChatReadAsFreelancer(ctx: TenantContext, engagementId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx
      .update(engagements)
      .set({ freelancerChatLastReadAt: sql`now()` })
      .where(eq(engagements.id, engagementId));
  });
}

/** Unread inbound (freelancer→client) message count for the Client's badge — messages newer than
 * the Client's read cursor. RLS-scoped to the client's engagement. */
export async function clientChatUnread(ctx: TenantContext): Promise<number> {
  const engagementId = ctx.engagementId;
  if (!engagementId) return 0;
  return withTenant(ctx, async (tx) => {
    const [acc] = await tx
      .select({ cursor: clientAccess.chatLastReadAt })
      .from(clientAccess)
      .where(eq(clientAccess.engagementId, engagementId))
      .limit(1);
    const cursor = acc?.cursor ?? null;
    const [row] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.engagementId, engagementId),
          eq(messages.senderRole, "freelancer"),
          cursor ? gt(messages.createdAt, cursor) : undefined,
        ),
      );
    return row?.c ?? 0;
  });
}

/** Unread inbound (client→freelancer) message count for one engagement — the Messages-tab badge. */
export async function freelancerChatUnread(ctx: TenantContext, engagementId: string): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const [eng] = await tx
      .select({ cursor: engagements.freelancerChatLastReadAt })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!eng) return 0; // not the caller's engagement (RLS → 0 rows)
    const cursor = eng.cursor ?? null;
    const [row] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.engagementId, engagementId),
          eq(messages.senderRole, "client"),
          cursor ? gt(messages.createdAt, cursor) : undefined,
        ),
      );
    return row?.c ?? 0;
  });
}

/** Map of engagementId → unread inbound (client→freelancer) count, for the dashboard "needs
 * attention" badge. One grouped, RLS-scoped query (not N+1); engagements with 0 unread are absent. */
export async function freelancerChatUnreadByEngagement(ctx: TenantContext): Promise<Map<string, number>> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ engagementId: messages.engagementId, c: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(engagements, eq(engagements.id, messages.engagementId))
      .where(
        and(
          eq(messages.senderRole, "client"),
          sql`(${engagements.freelancerChatLastReadAt} IS NULL OR ${messages.createdAt} > ${engagements.freelancerChatLastReadAt})`,
        ),
      )
      .groupBy(messages.engagementId),
  );
  const map = new Map<string, number>();
  for (const r of rows) if (r.c > 0) map.set(r.engagementId, r.c);
  return map;
}

/** The Freelancer's read cursor for an engagement — the OTHER-party read for the CLIENT's "Read"
 * receipt (the client sees "Read" once the freelancer's cursor passes their message). */
export async function getFreelancerLastRead(ctx: TenantContext, engagementId: string): Promise<Date | null> {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ at: engagements.freelancerChatLastReadAt })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    return row?.at ?? null;
  });
}

/** The Client's read cursor for an engagement — the OTHER-party read for the FREELANCER's "Read"
 * receipt. */
export async function getClientLastRead(ctx: TenantContext, engagementId: string): Promise<Date | null> {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ at: clientAccess.chatLastReadAt })
      .from(clientAccess)
      .where(eq(clientAccess.engagementId, engagementId))
      .limit(1);
    return row?.at ?? null;
  });
}
