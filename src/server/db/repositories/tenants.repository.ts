import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { withTenant, type TenantContext } from "../context";
import { tenants, user } from "../schema";

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

/** The chosen slug is already taken by another Tenant (caught via the unique index). */
export class SlugTakenError extends Error {
  constructor() {
    super("slug already taken");
    this.name = "SlugTakenError";
  }
}

/** This Freelancer already owns a Tenant (one-Tenant-per-owner unique constraint). */
export class AlreadyProvisionedError extends Error {
  constructor() {
    super("owner already has a tenant");
    this.name = "AlreadyProvisionedError";
  }
}

/**
 * True if `err` is a Postgres unique-violation (SQLSTATE 23505) on the named
 * constraint. Works across drivers (Neon serverless + PGlite): some surface
 * `.code`/`.constraint`, all put the constraint name in the message
 * (`duplicate key value violates unique constraint "..."`), so we match either.
 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: unknown;
  };
  const cause = (e.cause ?? {}) as { code?: string; constraint?: string; message?: string };
  const code = e.code ?? cause.code;
  const con = e.constraint ?? cause.constraint;
  const msg = `${e.message ?? ""} ${cause.message ?? ""}`;
  const isUnique = code === "23505" || /duplicate key value|unique constraint/i.test(msg);
  return isUnique && (con === constraint || msg.includes(constraint));
}

/**
 * Provision a Tenant for a Freelancer during sign-up (Story 1.3).
 *
 * Stays inside the NFR-2 choke point: the id is generated up front so the tx is
 * scoped to the NEW tenant (the `tenant_self` WITH CHECK requires id = app.tenant_id),
 * then we stamp the owner's forward link (`user.tenantId`) in the same tx — the
 * `user` table has no RLS, so the Tenant GUC doesn't affect that write.
 *
 * Uniqueness is enforced by the DB (RLS forbids reading other Tenants' slugs, so a
 * pre-check is impossible): a 23505 on `tenants_slug_unique` → SlugTakenError; on
 * `tenants_owner_user_id_unique` → AlreadyProvisionedError.
 */
export async function provisionTenant(input: {
  ownerUserId: string;
  slug: string;
  name: string;
}) {
  const id = uuidv7();
  try {
    return await withTenant(
      { tenantId: id, userId: input.ownerUserId, role: "freelancer" },
      async (tx) => {
        const [row] = await tx
          .insert(tenants)
          .values({
            id,
            slug: input.slug,
            name: input.name,
            ownerUserId: input.ownerUserId,
          })
          .returning();
        await tx.update(user).set({ tenantId: id }).where(eq(user.id, input.ownerUserId));
        return row;
      },
    );
  } catch (err) {
    if (isUniqueViolation(err, "tenants_slug_unique")) throw new SlugTakenError();
    if (isUniqueViolation(err, "tenants_owner_user_id_unique")) {
      throw new AlreadyProvisionedError();
    }
    throw err;
  }
}

/**
 * Mark a Tenant active (Story 1.3, AC-2) — called from Better Auth's
 * afterEmailVerification hook, which carries `user.tenantId` (the forward link),
 * so we scope by that known id and the `tenant_self` policy permits the self-UPDATE.
 *
 * Defense-in-depth: the `tenant_self` RLS policy only binds `id = app.tenant_id`, not
 * the owner — so we ALSO require `owner_user_id = ownerUserId` in the predicate. A
 * caller can never activate a Tenant it doesn't own (0 rows updated if mismatched).
 *
 * Idempotent: `activated_at` is stamped only while NULL. Better Auth fires
 * afterEmailVerification for BOTH initial sign-up and later email changes, so without
 * the `isNull` guard an email change would reset the original activation timestamp.
 */
export async function activateTenant(ownerUserId: string, tenantId: string) {
  return withTenant(
    { tenantId, userId: ownerUserId, role: "freelancer" },
    (tx) =>
      tx
        .update(tenants)
        .set({ activatedAt: sql`now()` })
        .where(
          and(
            eq(tenants.id, tenantId),
            eq(tenants.ownerUserId, ownerUserId),
            isNull(tenants.activatedAt),
          ),
        )
        .returning(),
  );
}
