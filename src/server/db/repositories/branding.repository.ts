import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "../context";
import { branding } from "../schema";

/** Read the caller's Tenant branding (null if not set yet). Request-cached (Epic 4 prep): the
 * portal's nested layouts each resolve branding; with the cached session as a stable `ctx`, this
 * dedups to one read per request. `cache()` no-ops outside a render (tests call through fresh). */
export const getBranding = cache((ctx: TenantContext) => {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(branding)
      .where(eq(branding.tenantId, ctx.tenantId))
      .limit(1);
    return row ?? null;
  });
});

/** Create or update the caller's Tenant branding (1:1 with the Tenant). */
export async function upsertBranding(
  ctx: TenantContext,
  data: { logoBlobUrl?: string; accentHex?: string; accentTextHex?: string },
) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(branding)
      .values({ tenantId: ctx.tenantId, ...data })
      .onConflictDoUpdate({
        target: branding.tenantId,
        set: { ...data, updatedAt: sql`now()` },
      })
      .returning();
    return row;
  });
}
