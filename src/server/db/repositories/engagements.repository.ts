import { desc, eq, ne, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { engagements } from "../schema";

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
