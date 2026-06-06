import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it } from "vitest";
import { branding, engagements, invitations, tenants, user } from "../schema";
import { applyTenantScope } from "../scope";

// In-process Postgres (PGlite) — real RLS semantics, offline, no Neon/docker needed.
const client = new PGlite();
const db = drizzle(client, { schema: { tenants, branding, user, engagements, invitations } });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();
// Story 1.3: tenants.owner_user_id is now a NOT NULL FK → user.id, so the seed
// needs real owner rows (the user table is global / has no RLS).
const OWNER_A = "owner_a";
const OWNER_B = "owner_b";
// Story 2.1: two Engagements in Tenant A (E1/E2) + one in Tenant B — the fixture
// that proves a Client scoped to E1 can never see E2 of the same Tenant.
const ENG_A1 = uuidv7();
const ENG_A2 = uuidv7();
const ENG_B1 = uuidv7();

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

/** Like asTenant but ALSO sets app.engagement_id — mirrors a Client request scoped to
 * one Engagement (Story 2.1 / pre-mortem guardrail #5). */
async function asClient<T>(
  tenantId: string,
  engagementId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenantScope(tx, { tenantId, engagementId });
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
  // Seed the FK owners first (global table, no RLS, no scope needed).
  await db.insert(user).values([
    { id: OWNER_A, name: "Owner A", email: "owner-a@example.com" },
    { id: OWNER_B, name: "Owner B", email: "owner-b@example.com" },
  ]);
  // Seed Tenant A and B + branding, each in its own scoped tx (also proves WITH CHECK on insert).
  await asTenant(TENANT_A, async (tx) => {
    await tx.insert(tenants).values({ id: TENANT_A, slug: "alpha", name: "Alpha", ownerUserId: OWNER_A });
    await tx.insert(branding).values({ tenantId: TENANT_A, accentHex: "#aaaaaa" });
  });
  await asTenant(TENANT_B, async (tx) => {
    await tx.insert(tenants).values({ id: TENANT_B, slug: "beta", name: "Beta", ownerUserId: OWNER_B });
    await tx.insert(branding).values({ tenantId: TENANT_B, accentHex: "#bbbbbb" });
  });
  // Seed Engagements (scoped, so the WITH CHECK is exercised on insert too).
  await asTenant(TENANT_A, (tx) =>
    tx.insert(engagements).values([
      { id: ENG_A1, tenantId: TENANT_A, clientDisplayName: "Client One", name: "Project One" },
      { id: ENG_A2, tenantId: TENANT_A, clientDisplayName: "Client Two", name: "Project Two" },
    ]),
  );
  await asTenant(TENANT_B, (tx) =>
    tx.insert(engagements).values({ id: ENG_B1, tenantId: TENANT_B, clientDisplayName: "Client B", name: "Project B" }),
  );
  // Seed one Invitation per Tenant (Story 2.3), scoped so WITH CHECK is exercised.
  const future = new Date("2030-01-01T00:00:00Z");
  await asTenant(TENANT_A, (tx) =>
    tx.insert(invitations).values({
      tenantId: TENANT_A,
      engagementId: ENG_A1,
      email: "client-a@example.com",
      tokenHash: "hash_a",
      expiresAt: future,
    }),
  );
  await asTenant(TENANT_B, (tx) =>
    tx.insert(invitations).values({
      tenantId: TENANT_B,
      engagementId: ENG_B1,
      email: "client-b@example.com",
      tokenHash: "hash_b",
      expiresAt: future,
    }),
  );
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

});

describe("NFR-2 isolation — engagement-scoped (the Client case, before any Client UI)", () => {
  it("(h) a Freelancer (tenant scope, no engagement) sees ALL their Tenant's Engagements", async () => {
    const rows = await asTenant(TENANT_A, (tx) => tx.select().from(engagements));
    expect(rows.map((r) => r.id).sort()).toEqual([ENG_A1, ENG_A2].sort());
  });

  it("(i) a Client (engagement-scoped to E1) sees ONLY E1 — never E2 of the SAME Tenant", async () => {
    const rows = await asClient(TENANT_A, ENG_A1, (tx) => tx.select().from(engagements));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ENG_A1);
  });

  it("(j) the Client cannot reach a sibling Engagement even by explicit id", async () => {
    const rows = await asClient(TENANT_A, ENG_A1, (tx) =>
      tx.select().from(engagements).where(eq(engagements.id, ENG_A2)),
    );
    expect(rows).toHaveLength(0);
  });

  it("(k) cross-tenant: Tenant B sees only its own Engagement", async () => {
    const rows = await asTenant(TENANT_B, (tx) => tx.select().from(engagements));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ENG_B1);
  });

  it("(k2) WITH CHECK blocks INSERTing an Engagement stamped for ANOTHER Tenant", async () => {
    // The real policy test (vs. the repo merely stamping ctx.tenantId): scoped to A,
    // try to forge a row into B → the engagement_scope WITH CHECK rejects it.
    await expect(
      asTenant(TENANT_A, (tx) =>
        tx
          .insert(engagements)
          .values({ tenantId: TENANT_B, clientDisplayName: "Forged", name: "Forged" }),
      ),
    ).rejects.toThrow();
  });

  it("(l) engagements fail closed with no scope (soloist_app, no GUCs) → 0 rows", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role soloist_app`);
      return tx.select().from(engagements);
    });
    expect(rows).toHaveLength(0);
  });
});

describe("NFR-2 isolation — invitations (Story 2.3)", () => {
  it("(m) a Freelancer sees only their own Tenant's invitations", async () => {
    const rows = await asTenant(TENANT_A, (tx) => tx.select().from(invitations));
    expect(rows).toHaveLength(1);
    expect(rows[0].engagementId).toBe(ENG_A1);
    expect(rows[0].email).toBe("client-a@example.com");
  });

  it("(n) cross-tenant: Tenant B sees only its own invitation", async () => {
    const rows = await asTenant(TENANT_B, (tx) => tx.select().from(invitations));
    expect(rows).toHaveLength(1);
    expect(rows[0].engagementId).toBe(ENG_B1);
  });

  it("(o) WITH CHECK blocks an invitation forged for ANOTHER Tenant", async () => {
    // Forge into ENG_A2 (Tenant A, NO existing invitation) with a fresh token hash, so the
    // ONLY thing that can reject is the WITH CHECK (tenant_id = B ≠ current Tenant A) — not
    // the engagement_id / token_hash unique constraints.
    await expect(
      asTenant(TENANT_A, (tx) =>
        tx.insert(invitations).values({
          tenantId: TENANT_B,
          engagementId: ENG_A2,
          email: "forged@example.com",
          tokenHash: "hash_forged",
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        }),
      ),
    ).rejects.toThrow();
  });

  it("(p) invitations fail closed with no scope (soloist_app, no GUCs) → 0 rows", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role soloist_app`);
      return tx.select().from(invitations);
    });
    expect(rows).toHaveLength(0);
  });
});
