import { sql, type SQL } from "drizzle-orm";

/** Everything the data layer needs to scope a request to one Tenant (and, for Clients, one Engagement). */
export type TenantContext = {
  tenantId: string;
  userId: string;
  role: "freelancer" | "client";
  engagementId?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scope an OPEN transaction to a Tenant (and optional Engagement) for RLS.
 *
 * 1. `SET LOCAL ROLE soloist_app` — the connection role (Neon's `neondb_owner`)
 *    has BYPASSRLS, so RLS is INERT when queries run as it (even with FORCE). The
 *    `soloist_app` role (migration 0001) is NOBYPASSRLS, so switching to it for the
 *    transaction makes the policies actually apply. This is the NFR-2 backstop.
 * 2. `set_config(name, value, true)` — the transaction-local (SET LOCAL) form; the
 *    GUC is discarded at COMMIT/ROLLBACK, so nothing leaks across pooled connections.
 *
 * Structurally typed on `{ execute }` so the same helper drives the prod Neon
 * transaction and a PGlite transaction in the isolation tests (no db import here).
 */
export async function applyTenantScope(
  tx: { execute: (query: SQL) => Promise<unknown> },
  ctx: Pick<TenantContext, "tenantId" | "engagementId">,
): Promise<void> {
  // Validate up front: a malformed id would otherwise surface as a `''::uuid` cast
  // error inside the RLS policy (a 500), not a clear failure here.
  if (!UUID_RE.test(ctx.tenantId)) {
    throw new Error(`applyTenantScope: invalid tenantId "${ctx.tenantId}"`);
  }
  if (ctx.engagementId !== undefined && !UUID_RE.test(ctx.engagementId)) {
    throw new Error(`applyTenantScope: invalid engagementId "${ctx.engagementId}"`);
  }

  await tx.execute(sql`set local role soloist_app`);
  await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
  if (ctx.engagementId) {
    await tx.execute(
      sql`select set_config('app.engagement_id', ${ctx.engagementId}, true)`,
    );
  }
}
