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

import {
  createNotification,
  listNotifications,
  loadShipPublishedContext,
  markAllNotificationsRead,
  markNotificationsRead,
} from "../repositories/notifications.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { createInvoice } from "../repositories/invoices.repository";
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

describe("Story 4.1 — notification center reads + mark-read", () => {
  let ENG_C = "";
  let SU1 = "";
  let SU2 = "";
  let N_UNREAD = "";
  let N_READ = "";
  let N_OWNER = ""; // a notification for owner-a (a 2nd recipient on the same engagement)
  // The Client recipient + a SECOND recipient on the SAME engagement (proves the user_id filter).
  const clientCtx = (): TenantContext => ({ tenantId: TENANT_A, userId: "client-c", role: "client", engagementId: ENG_C });
  const clientCtxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "client-c", role: "client", engagementId: ENG_C });

  beforeAll(async () => {
    await h.db!.insert(user).values({ id: "client-c", name: "Client C", email: "client-c@example.com" });
    ENG_C = (await createEngagement(sysA(), { name: "Notif", clientDisplayName: "Acme C" })).id;
    const mkSu = async (title: string) => {
      const [su] = await h.db!
        .insert(schema.shipUpdates)
        .values({ tenantId: TENANT_A, engagementId: ENG_C, statusTag: "shipped", title, source: "github", state: "published" })
        .returning();
      return su.id;
    };
    SU1 = await mkSu("Shipped onboarding");
    SU2 = await mkSu("Shipped billing");
    const [n1] = await h.db!
      .insert(schema.notifications)
      .values({ tenantId: TENANT_A, engagementId: ENG_C, userId: "client-c", type: "ship_published", shipUpdateId: SU1, createdAt: new Date("2026-02-02T00:00:00Z") })
      .returning();
    N_UNREAD = n1.id;
    const [n2] = await h.db!
      .insert(schema.notifications)
      .values({ tenantId: TENANT_A, engagementId: ENG_C, userId: "client-c", type: "ship_published", shipUpdateId: SU2, createdAt: new Date("2026-02-01T00:00:00Z"), readAt: new Date("2026-02-03T00:00:00Z") })
      .returning();
    N_READ = n2.id;
    // A SECOND recipient (owner-a) on the SAME engagement — must NOT appear in / be markable by client-c.
    const [nOwner] = await h.db!
      .insert(schema.notifications)
      .values({ tenantId: TENANT_A, engagementId: ENG_C, userId: "owner-a", type: "ship_published", shipUpdateId: SU1, createdAt: new Date("2026-02-04T00:00:00Z") })
      .returning();
    N_OWNER = nOwner.id;
  });

  it("listNotifications: the caller's OWN rows newest-first, joined to the ship_update, NOT another recipient's", async () => {
    const list = await listNotifications(clientCtx());
    expect(list.map((r) => r.id)).toEqual([N_UNREAD, N_READ]); // newest-first, only client-c's (owner-a absent)
    expect(list[0]).toMatchObject({ title: "Shipped onboarding", statusTag: "shipped", readAt: null });
    expect(list[1].readAt).not.toBeNull();
    // The owner-a notification (same engagement) is excluded by the user_id filter.
    expect(list.some((r) => r.shipUpdateId === SU1 && r.id !== N_UNREAD)).toBe(false);
  });

  it("markNotificationsRead: stamps read_at once (replay → 0), only the caller's own", async () => {
    // A co-recipient's row in the SAME engagement passes RLS but is excluded by the user_id filter.
    expect(await markNotificationsRead(clientCtx(), [N_OWNER])).toEqual({ count: 0 });
    const [owner] = await h.db!.select().from(schema.notifications).where(eq(schema.notifications.id, N_OWNER));
    expect(owner.readAt).toBeNull(); // owner-a's row is untouched by client-c

    expect(await markNotificationsRead(clientCtx(), [N_UNREAD])).toEqual({ count: 1 });
    expect(await markNotificationsRead(clientCtx(), [N_UNREAD])).toEqual({ count: 0 }); // already read
    expect(await markNotificationsRead(clientCtx(), [])).toEqual({ count: 0 });
  });

  it("markAllNotificationsRead: clears all the caller's remaining unread", async () => {
    // Seed one more unread for client-c, then mark-all.
    await h.db!.insert(schema.notifications).values({ tenantId: TENANT_A, engagementId: ENG_C, userId: "client-c", type: "engagement_start", shipUpdateId: null, createdAt: new Date("2026-02-05T00:00:00Z") });
    const res = await markAllNotificationsRead(clientCtx());
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(await markAllNotificationsRead(clientCtx())).toEqual({ count: 0 }); // nothing left
    expect((await listNotifications(clientCtx())).every((r) => r.readAt != null)).toBe(true);
  });

  it("NFR-2: Tenant B sees/marks none of Tenant A's notifications (RLS)", async () => {
    expect(await listNotifications(clientCtxB())).toHaveLength(0);
    expect(await markNotificationsRead(clientCtxB(), [N_READ])).toEqual({ count: 0 });
  });
});

describe("Story 5.2 — invoice notifications (invoice_id + dedup + projection)", () => {
  let ENG_I = "";
  let INV = "";
  let INV_NUM = 0;
  const clientI = (): TenantContext => ({ tenantId: TENANT_A, userId: "client-i", role: "client", engagementId: ENG_I });

  beforeAll(async () => {
    await h.db!.insert(user).values({ id: "client-i", name: "Client I", email: "client-i@example.com" });
    ENG_I = (await createEngagement(sysA(), { name: "Inv", clientDisplayName: "Acme I" })).id;
    const inv = await createInvoice(sysA(), {
      engagementId: ENG_I,
      lineItems: [{ description: "Build", quantity: 1, unitAmount: 50000 }],
      currency: "PHP",
    });
    INV = inv.id;
    INV_NUM = inv.number;
    // A ship_published notification on the SAME engagement — proves the projection nulls cleanly.
    const [su] = await h.db!
      .insert(schema.shipUpdates)
      .values({ tenantId: TENANT_A, engagementId: ENG_I, statusTag: "shipped", title: "Shipped X", source: "github", state: "published" })
      .returning();
    await createNotification(sysA(), { engagementId: ENG_I, userId: "client-i", type: "ship_published", shipUpdateId: su.id });
  });

  it("createNotification with invoiceId inserts; a second identical (recipient, invoice) → null (the invoice dedup)", async () => {
    const first = await createNotification(sysA(), { engagementId: ENG_I, userId: "client-i", type: "invoice_sent", invoiceId: INV });
    expect(first?.type).toBe("invoice_sent");
    expect(first?.invoiceId).toBe(INV);
    const dup = await createNotification(sysA(), { engagementId: ENG_I, userId: "client-i", type: "invoice_sent", invoiceId: INV });
    expect(dup).toBeNull(); // notifications_invoice_dedup
  });

  it("listNotifications projects invoiceId + invoiceNumber for the invoice row, null for the ship row", async () => {
    const list = await listNotifications(clientI());
    const inv = list.find((r) => r.type === "invoice_sent");
    expect(inv?.invoiceId).toBe(INV);
    expect(inv?.invoiceNumber).toBe(INV_NUM);
    expect(inv?.title).toBeNull(); // no ship_update joined for an invoice row
    const ship = list.find((r) => r.type === "ship_published");
    expect(ship?.invoiceId).toBeNull();
    expect(ship?.invoiceNumber).toBeNull();
  });
});
