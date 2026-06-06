import { and, eq, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "../index";
import { withTenant, type TenantContext } from "../context";
import { githubInstallations, repoConnections, type GithubInstallation } from "../schema";

/**
 * Bind a GitHub App installation to the caller's Tenant (Story 3.2.1). **RAW `db`** (not
 * `withTenant`) ON PURPOSE: the Setup flow has already OAuth-verified the caller controls this
 * installation, and `onConflictDoUpdate` must re-assert `tenant_id` to the current caller —
 * including a legitimate transfer from another Tenant, which RLS would otherwise block (the
 * foreign row is invisible to a `withTenant` UPDATE → a 23505/RLS error). The authz here is the
 * OAuth ownership proof + the verified session `ctx.tenantId`; the READ side (`listInstallations`)
 * stays RLS-scoped, so a Freelancer can still only ever SEE their own installations.
 */
export async function recordInstallation(
  ctx: TenantContext,
  input: { ghInstallationId: string; accountLogin: string | null },
): Promise<GithubInstallation> {
  const id = uuidv7();
  const [row] = await db
    .insert(githubInstallations)
    .values({
      id,
      tenantId: ctx.tenantId,
      ghInstallationId: input.ghInstallationId,
      accountLogin: input.accountLogin,
    })
    .onConflictDoUpdate({
      target: githubInstallations.ghInstallationId,
      set: { tenantId: ctx.tenantId, accountLogin: input.accountLogin },
    })
    .returning();
  return row;
}

/** The caller Tenant's installations (RLS-scoped), newest first. */
export async function listInstallations(ctx: TenantContext): Promise<GithubInstallation[]> {
  return withTenant(ctx, (tx) => tx.select().from(githubInstallations));
}

/** Just the `gh_installation_id`s the caller's Tenant owns — the scope for `listReposForInstallations`. */
export async function listInstallationIds(ctx: TenantContext): Promise<string[]> {
  const rows = await listInstallations(ctx);
  return rows.map((r) => r.ghInstallationId);
}

/** Remove a binding (the `installation.deleted` webhook — PRE-TENANT, raw `db`). */
export async function removeInstallation(ghInstallationId: string): Promise<number> {
  const rows = await db
    .delete(githubInstallations)
    .where(eq(githubInstallations.ghInstallationId, ghInstallationId))
    .returning({ id: githubInstallations.id });
  return rows.length;
}

/** Disconnect every ACTIVE repo connection that fed through an installation (uninstall cleanup —
 * PRE-TENANT, raw `db`). Returns the number disconnected. */
export async function disconnectByInstallation(ghInstallationId: string): Promise<number> {
  const rows = await db
    .update(repoConnections)
    .set({ status: "disconnected" })
    .where(
      and(
        eq(repoConnections.ghInstallationId, ghInstallationId),
        ne(repoConnections.status, "disconnected"),
      ),
    )
    .returning({ id: repoConnections.id });
  return rows.length;
}
