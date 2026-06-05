import { db } from "./index";
import { applyTenantScope, type TenantContext } from "./scope";

export { applyTenantScope } from "./scope";
export type { TenantContext } from "./scope";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * THE isolation choke point. Opens a transaction, sets the RLS GUCs from `ctx`,
 * then runs `fn` with the scoped transaction. Every repository call wraps its
 * query in this. The app-layer `where tenant_id = ctx.tenantId` predicate is the
 * primary guard; the DB-level RLS policies (FORCED on the owner role) are the seatbelt.
 */
export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenantScope(tx, ctx);
    return fn(tx);
  });
}
