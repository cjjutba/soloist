import { and, desc, eq, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { repoConnections, type RepoConnection } from "../schema";

/** List a single Engagement's repo connections (Story 3.2). RLS scopes the Tenant; the
 * `engagement_id` filter is defense-in-depth. Newest first. */
export async function listConnections(
  ctx: TenantContext,
  engagementId: string,
): Promise<RepoConnection[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(repoConnections)
      .where(eq(repoConnections.engagementId, engagementId))
      .orderBy(desc(repoConnections.createdAt)),
  );
}

/** Connect a repo to an Engagement (`status = 'connected'`). The partial unique
 * (`repo_connections_active_repo`, one ACTIVE connection per repo) throws on a 2nd active
 * connect — the action maps Postgres `23505` → "already connected". A previously-disconnected
 * repo has no active row, so a reconnect inserts a fresh row (the old disconnected row stays).
 *
 * AUTHZ: the caller MUST have verified `engagementId` belongs to the Tenant — the connect action
 * does `getEngagement(ctx, engagementId)` first. The dual-scope WITH CHECK only enforces
 * `tenant_id` here (its engagement clause is a no-op for a Freelancer, whose `currentEngagement`
 * is NULL), so the engagement-ownership gate lives in the action, not the policy. */
export async function connectRepo(
  ctx: TenantContext,
  input: { engagementId: string; ghInstallationId: string; ghRepoId: string; repoFullName: string },
): Promise<RepoConnection> {
  const id = uuidv7();
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(repoConnections)
      .values({
        id,
        tenantId: ctx.tenantId,
        engagementId: input.engagementId,
        ghInstallationId: input.ghInstallationId,
        ghRepoId: input.ghRepoId,
        repoFullName: input.repoFullName,
      })
      .returning();
    return row;
  });
}

/** Soft-disconnect (`status = 'disconnected'`) — stops feeding the Engagement; the row stays
 * as history and frees the repo to be reconnected. RLS-scoped → null if not the caller's. */
export async function disconnectRepo(
  ctx: TenantContext,
  connectionId: string,
): Promise<RepoConnection | null> {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(repoConnections)
      .set({ status: "disconnected" })
      .where(eq(repoConnections.id, connectionId))
      .returning();
    return row ?? null;
  });
}

/**
 * SYSTEM read (the Inngest pipeline runs PRE-TENANT, no session) — raw `db` (owner,
 * BYPASSRLS), like `findInvitationByTokenHash`/`recordDelivery`. Resolve a repo → its
 * Engagement via the ACTIVE (non-disconnected) connection; the partial unique guarantees ≤1
 * match. Returns null for a disconnected or never-connected repo (→ the pipeline no-ops).
 * **This replaces the Story 3.1 `findSpikeTargetEngagement` spike shortcut.**
 */
export async function findEngagementForRepo(
  repoFullName: string,
): Promise<{ tenantId: string; engagementId: string } | null> {
  const rows = await db
    .select({
      tenantId: repoConnections.tenantId,
      engagementId: repoConnections.engagementId,
    })
    .from(repoConnections)
    .where(
      and(eq(repoConnections.repoFullName, repoFullName), ne(repoConnections.status, "disconnected")),
    )
    .limit(2);
  // The partial unique guarantees ≤1 active row. `.limit(2)` + this exactly-one check is a
  // fail-CLOSED backstop (mirrors the retired spike fn): if that invariant is ever broken, we
  // refuse to mis-attribute the webhook to an arbitrary Tenant rather than picking one blindly.
  return rows.length === 1 ? rows[0] : null;
}

/** Every `repo_full_name` the Tenant currently has ACTIVELY connected (across all its
 * Engagements). The connect picker excludes these so it never offers a repo that would 23505
 * on connect (RLS scopes this to the caller's Tenant). */
export async function listActiveRepoFullNames(ctx: TenantContext): Promise<string[]> {
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ repoFullName: repoConnections.repoFullName })
      .from(repoConnections)
      .where(ne(repoConnections.status, "disconnected")),
  );
  return rows.map((r) => r.repoFullName);
}
