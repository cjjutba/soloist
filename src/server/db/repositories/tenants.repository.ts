import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { tenants } from "../schema";

/** Read the caller's own Tenant (RLS + the predicate both scope to ctx.tenantId). */
export async function getTenant(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Provision a Tenant. The id is generated up front so the request can be scoped
 * to the NEW tenant (the `tenant_self` WITH CHECK requires id = app.tenant_id).
 * In Story 1.3 this is called during Freelancer sign-up; here, by tests/seeds.
 */
export async function createTenant(
  input: { slug: string; name: string },
  actorUserId: string,
) {
  const id = uuidv7();
  return withTenant(
    { tenantId: id, userId: actorUserId, role: "freelancer" },
    async (tx) => {
      const [row] = await tx
        .insert(tenants)
        .values({ id, slug: input.slug, name: input.name })
        .returning();
      return row;
    },
  );
}
