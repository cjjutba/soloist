import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it } from "vitest";
import { branding, tenants } from "../schema";
import { applyTenantScope } from "../scope";

// In-process Postgres (PGlite) — real RLS semantics, offline, no Neon/docker needed.
const client = new PGlite();
const db = drizzle(client, { schema: { tenants, branding } });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();

/**
 * Mirrors production exactly: open a transaction and call the REAL `applyTenantScope`,
 * which does `SET LOCAL ROLE soloist_app` (the NOBYPASSRLS role from migration 0001)
 * + sets the tenant GUC. PGlite's default role is a superuser that BYPASSES RLS, and
 * Neon's connection role has BYPASSRLS — so in BOTH, RLS only applies after switching
 * to soloist_app. If that switch ever silently failed, tests (b)/(g) would return rows
 * and fail (a superuser would see everything).
 */
async function asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenantScope(tx, { tenantId });
    return fn(tx);
  });
}

beforeAll(async () => {
  // Apply the committed migration(s) — schema + RLS + FORCE (0000) and the soloist_app role (0001).
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
  }
  // Seed Tenant A and B + branding, each in its own scoped tx (also proves WITH CHECK on insert).
  await asTenant(TENANT_A, async (tx) => {
    await tx.insert(tenants).values({ id: TENANT_A, slug: "alpha", name: "Alpha" });
    await tx.insert(branding).values({ tenantId: TENANT_A, accentHex: "#aaaaaa" });
  });
  await asTenant(TENANT_B, async (tx) => {
    await tx.insert(tenants).values({ id: TENANT_B, slug: "beta", name: "Beta" });
    await tx.insert(branding).values({ tenantId: TENANT_B, accentHex: "#bbbbbb" });
  });
});

describe("NFR-2 isolation — Postgres RLS backstop", () => {
  it("(a) a scoped read returns only the active Tenant's branding", async () => {
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.select().from(branding).where(eq(branding.tenantId, TENANT_A)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accentHex).toBe("#aaaaaa");
  });

  it("(b) an UNSCOPED query still returns only the active Tenant's rows — RLS, not the predicate", async () => {
    const rows = await asTenant(TENANT_A, (tx) => tx.select().from(branding)); // no .where()!
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.tenantId === TENANT_A)).toBe(true);
  });

  it("(c) a cross-tenant read returns zero rows (not-found, never denied)", async () => {
    const rows = await asTenant(TENANT_A, (tx) =>
      tx.select().from(branding).where(eq(branding.tenantId, TENANT_B)),
    );
    expect(rows).toHaveLength(0);
  });

  it("(d) tenants self-policy: a Tenant sees only itself", async () => {
    const rows = await asTenant(TENANT_B, (tx) => tx.select().from(tenants));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(TENANT_B);
  });

  it("(e) WITH CHECK blocks INSERTing a row for a different Tenant", async () => {
    await expect(
      asTenant(TENANT_A, (tx) =>
        tx.insert(branding).values({ tenantId: TENANT_B, accentHex: "#000000" }),
      ),
    ).rejects.toThrow();
  });

  it("(f) cross-tenant UPDATE and DELETE affect zero rows; the victim row is untouched", async () => {
    const updated = await asTenant(TENANT_A, (tx) =>
      tx
        .update(branding)
        .set({ accentHex: "#hacked" })
        .where(eq(branding.tenantId, TENANT_B))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const deleted = await asTenant(TENANT_A, (tx) =>
      tx.delete(branding).where(eq(branding.tenantId, TENANT_B)).returning(),
    );
    expect(deleted).toHaveLength(0);

    const victim = await asTenant(TENANT_B, (tx) => tx.select().from(branding));
    expect(victim).toHaveLength(1);
    expect(victim[0].accentHex).toBe("#bbbbbb");
  });

  it("(g) with NO tenant scope set, queries FAIL CLOSED (zero rows) — proves RLS + an effective role switch", async () => {
    // Switch to the restricted role but deliberately do NOT set app.tenant_id.
    // current_setting('app.tenant_id', true) → NULL → `tenant_id = NULL` is never true → 0 rows.
    // (If the role switch had silently failed, the superuser would return ALL rows here.)
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role soloist_app`);
      return tx.select().from(branding);
    });
    expect(rows).toHaveLength(0);
  });

  // TODO (Story 2.1): add the engagement-scoped Client fixture (app.engagement_id +
  // an engagements table) once `engagements` exists.
});
