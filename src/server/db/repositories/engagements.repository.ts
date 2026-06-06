import { desc, eq, ne, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { engagements, type Engagement } from "../schema";

// (Story 3.1's `findSpikeTargetEngagement` shortcut was removed in Story 3.2 — the repo →
// engagement resolve now lives in repo-connections.repository's `findEngagementForRepo`.)

/** An Engagement plus the count of unpublished candidate Ship Updates awaiting curation —
 * the dashboard's "needs attention" signal (Story 2.2). */
export type DashboardEngagement = Engagement & { candidateCount: number };

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

/** The dashboard read (Story 2.2): the caller's active Engagements, each with its
 * candidate count, sorted "needs attention first". */
export async function listDashboard(ctx: TenantContext): Promise<DashboardEngagement[]> {
  const rows = await listEngagements(ctx); // active only, RLS-scoped, last-activity desc
  // Candidate-count seam: Epic 3 replaces this `0` with
  //   COUNT(ship_updates WHERE engagement_id = e.id AND state = 'candidate').
  // `ship_updates` doesn't exist yet → 0 for all → the badge is absent (the correct now-state).
  const withCounts = rows.map((e) => ({ ...e, candidateCount: 0 }));
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
