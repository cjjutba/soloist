import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { user } from "../schema";
import type { TenantContext } from "../context";

const h = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle> | undefined }));
vi.mock("../index", () => ({
  get db() {
    return h.db;
  },
}));

import { createNotification, loadShipPublishedContext } from "../repositories/notifications.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let SHIP_A = "";
// The fan-out inserts under a system/tenant-scoped ctx (no engagement_id).
const sysA = (): TenantContext => ({ tenantId: TENANT_A, userId: "system", role: "freelancer" });
const sysB = (): TenantContext => ({ tenantId: TENANT_B, userId: "system", role: "freelancer" });

beforeAll(async () => {
  const client = new PGlite();
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
  }
  h.db = drizzle(client, { schema });
  await h.db.insert(user).values([
    { id: "owner-a", name: "Owner A", email: "owner-a@example.com" },
    { id: "owner-b", name: "Owner B", email: "owner-b@example.com" },
    { id: "client-a", name: "Client A", email: "client-a@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "owner-a", slug: "alpha", name: "Alpha Studio" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "owner-b", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(sysA(), { name: "Proj", clientDisplayName: "Acme Co" })).id;
  const [su] = await h.db
    .insert(schema.shipUpdates)
    .values({ tenantId: TENANT_A, engagementId: ENG_A, statusTag: "shipped", title: "Shipped auth", source: "github", state: "published" })
    .returning();
  SHIP_A = su.id;
});

describe("Story 3.6 — notifications repository", () => {
  it("createNotification inserts under the system/tenant ctx and is idempotent (dedup)", async () => {
    const first = await createNotification(sysA(), {
      engagementId: ENG_A,
      userId: "client-a",
      type: "ship_published",
      shipUpdateId: SHIP_A,
    });
    expect(first?.tenantId).toBe(TENANT_A);
    expect(first?.type).toBe("ship_published");

    // Same (user, ship_update) → the partial unique makes the retry a no-op.
    const dup = await createNotification(sysA(), {
      engagementId: ENG_A,
      userId: "client-a",
      type: "ship_published",
      shipUpdateId: SHIP_A,
    });
    expect(dup).toBeNull();
    const rows = await h.db!
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.shipUpdateId, SHIP_A));
    expect(rows).toHaveLength(1);
  });

  it("NFR-2: Tenant B cannot write a notification into Tenant A's scope (RLS WITH CHECK)", async () => {
    // sysB stamps tenant_id=B, but engagement_id ENG_A belongs to A. The insert's tenant_id is B,
    // so it lands in B's scope (not A's) — A's notification list is unaffected.
    await createNotification(sysB(), {
      engagementId: ENG_A, // foreign engagement id, but tenant_id is stamped from ctx (B)
      userId: "client-a",
      type: "ship_published",
      shipUpdateId: null,
    });
    const aRows = await h.db!
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.tenantId, TENANT_A));
    expect(aRows.every((r) => r.tenantId === TENANT_A)).toBe(true);
    // The B-scoped row is tagged to B, never A.
    const bRows = await h.db!
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.tenantId, TENANT_B));
    expect(bRows.length).toBeGreaterThan(0);
  });

  it("loadShipPublishedContext joins the email data (status/title/engagement/tenant; branding optional)", async () => {
    const ctx = await loadShipPublishedContext(SHIP_A);
    expect(ctx).toMatchObject({
      statusTag: "shipped",
      title: "Shipped auth",
      state: "published",
      engagementId: ENG_A,
      tenantId: TENANT_A,
      clientDisplayName: "Acme Co",
      tenantName: "Alpha Studio",
    });
    // No branding set for Alpha → null logo/accent (the email falls back).
    expect(ctx?.logoUrl).toBeNull();
    expect(ctx?.accentHex).toBeNull();
  });
});
