import { desc, eq, ne, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { engagements, type Engagement } from "../schema";
import { lastSeenByEngagement } from "./client-access.repository";
import { freelancerChatUnreadByEngagement } from "./messages.repository";
import { countCandidatesByEngagement } from "./ship-update.repository";

// (Story 3.1's `findSpikeTargetEngagement` shortcut was removed in Story 3.2 — the repo →
// engagement resolve now lives in repo-connections.repository's `findEngagementForRepo`.)

/** An Engagement plus the count of unpublished candidate Ship Updates awaiting curation —
 * the dashboard's "needs attention" signal (Story 2.2). */
export type DashboardEngagement = Engagement & {
  candidateCount: number;
  /** When the Client last opened the portal (null = never / no Client) — the "Client viewed X ago" hint. */
  lastSeenAt: Date | null;
  /** Unread inbound (client→freelancer) chat messages — the "they're waiting on a reply" signal. */
  chatUnreadCount: number;
};

/** Dashboard sort: last-activity (most recent first), then candidate-count (most first),
 * so the Engagements that need attention float to the top (FR-7, UX-DR8). Pure + exported
 * so the secondary key is unit-testable before Epic 3 produces non-zero counts. */
export function compareDashboard(a: DashboardEngagement, b: DashboardEngagement): number {
  return (
    b.lastActivityAt.getTime() - a.lastActivityAt.getTime() ||
    b.candidateCount - a.candidateCount
  );
}

/** Create an Engagement in the caller's Tenant (Story 2.1). The id is generated app-side
 * (uuid v7); the RLS WITH CHECK requires `tenant_id = app.tenant_id`, which `withTenant`
 * sets to `ctx.tenantId`. */
export async function createEngagement(
  ctx: TenantContext,
  input: { name: string; clientDisplayName: string; scope?: string | null },
) {
  const id = uuidv7();
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(engagements)
      .values({
        id,
        tenantId: ctx.tenantId,
        name: input.name,
        clientDisplayName: input.clientDisplayName,
        scope: input.scope ?? null,
      })
      .returning();
    return row;
  });
}

/** List the caller's Engagements (RLS scopes to the Tenant; archived hidden by default),
 * newest-activity first. */
export async function listEngagements(
  ctx: TenantContext,
  { includeArchived = false }: { includeArchived?: boolean } = {},
) {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(engagements)
      .where(includeArchived ? undefined : ne(engagements.status, "archived"))
      .orderBy(desc(engagements.lastActivityAt)),
  );
}

/** Just the caller's Engagement ids (RLS-scoped) — used to scope a freelancer's realtime token
 * capability to the channels for their own engagements. Includes archived (still their channels). */
export async function listEngagementIds(ctx: TenantContext): Promise<string[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx.select({ id: engagements.id }).from(engagements),
  );
  return rows.map((r) => r.id);
}

/** The dashboard read (Story 2.2): the caller's active Engagements, each with its
 * candidate count, sorted "needs attention first". */
export async function listDashboard(ctx: TenantContext): Promise<DashboardEngagement[]> {
  const rows = await listEngagements(ctx); // active only, RLS-scoped, last-activity desc
  // Story 3.5: the real "needs attention" count — one grouped, RLS-scoped query (not N+1).
  const counts = await countCandidatesByEngagement(ctx);
  const lastSeen = await lastSeenByEngagement(ctx); // "Client viewed X ago" per engagement
  const chatUnread = await freelancerChatUnreadByEngagement(ctx); // unread client messages per engagement
  const withCounts = rows.map((e) => ({
    ...e,
    candidateCount: counts.get(e.id) ?? 0,
    lastSeenAt: lastSeen.get(e.id) ?? null,
    chatUnreadCount: chatUnread.get(e.id) ?? 0,
  }));
  return withCounts.sort(compareDashboard);
}

/** Read one Engagement (null if it isn't the caller's — RLS returns 0 rows). */
export async function getEngagement(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, id))
      .limit(1);
    return row ?? null;
  });
}

/** Edit an Engagement (RLS-scoped → null if not the caller's). Bumps last_activity_at. */
export async function updateEngagement(
  ctx: TenantContext,
  id: string,
  data: {
    name?: string;
    clientDisplayName?: string;
    scope?: string | null;
    status?: string;
  },
) {
  // Allow-list the mutable columns explicitly (never spread caller `data` into .set()) so
  // tenant_id / id / created_at can't be moved through this — the only mutation path. Each
  // `undefined` field is omitted, so a partial patch leaves that column untouched.
  const { name, clientDisplayName, scope, status } = data;
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(engagements)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(clientDisplayName !== undefined ? { clientDisplayName } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(status !== undefined ? { status } : {}),
        lastActivityAt: sql`now()`,
      })
      .where(eq(engagements.id, id))
      .returning();
    return row ?? null;
  });
}

/** Soft-archive — hides from the active list without deleting history (AC-3). */
export async function archiveEngagement(ctx: TenantContext, id: string) {
  return updateEngagement(ctx, id, { status: "archived" });
}
