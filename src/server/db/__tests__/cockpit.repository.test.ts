import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
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
  invoiceMoneyStats,
  listOutstandingInvoices,
  listRecentPublishedUpdates,
  publishedUpdateDates,
} from "../repositories/cockpit.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { createInvoice, markInvoicePaid, markInvoiceSent } from "../repositories/invoices.repository";
import { createCandidate, publishShipUpdate } from "../repositories/ship-update.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_B = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "owner_a", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "owner_b", role: "freelancer" });
const line = (description: string, quantity: number, unitAmount: number) => ({ description, quantity, unitAmount });

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
    { id: "owner_a", name: "Owner A", email: "a@example.com" },
    { id: "owner_b", name: "Owner B", email: "b@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "owner_a", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "owner_b", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj A", clientDisplayName: "Acme" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Initech" })).id;

  // Tenant A: one paid (5000) + one sent/outstanding (3000), both PHP, issued now (this month).
  const paid = await createInvoice(ctxA(), { engagementId: ENG_A, lineItems: [line("Design", 1, 5000)], currency: "PHP" });
  await markInvoiceSent(ctxA(), paid.id);
  await markInvoicePaid(ctxA(), paid.id);
  const sent = await createInvoice(ctxA(), { engagementId: ENG_A, lineItems: [line("Build", 1, 3000)], currency: "PHP" });
  await markInvoiceSent(ctxA(), sent.id);

  // Tenant B: one paid (9999) — must NOT leak into Tenant A's stats (RLS).
  const bPaid = await createInvoice(ctxB(), { engagementId: ENG_B, lineItems: [line("X", 1, 9999)], currency: "PHP" });
  await markInvoiceSent(ctxB(), bPaid.id);
  await markInvoicePaid(ctxB(), bPaid.id);

  // Tenant A: one published ship update + one candidate (the candidate must be excluded).
  const cand = await createCandidate(ctxA(), { engagementId: ENG_A, statusTag: "shipped", title: "Shipped login", source: "manual" });
  await publishShipUpdate(ctxA(), cand!.id);
  await createCandidate(ctxA(), { engagementId: ENG_A, statusTag: "in_progress", title: "WIP dashboard", source: "manual" });
});

const MONTH_START = new Date(Date.UTC(2000, 0, 1)); // far past → "this month" includes the freshly-issued rows

describe("invoiceMoneyStats", () => {
  it("sums paid (since monthStart) + outstanding by currency, RLS-scoped to the tenant", async () => {
    const stats = await invoiceMoneyStats(ctxA(), MONTH_START);
    expect(stats.paidThisMonth).toEqual([{ currency: "PHP", minor: 5000, count: 1 }]); // not 5000+9999 (B excluded)
    expect(stats.outstanding).toEqual([{ currency: "PHP", minor: 3000, count: 1 }]);
  });
  it("is empty for a tenant with no invoices in range", async () => {
    const empty = await invoiceMoneyStats(ctxB(), new Date(Date.UTC(3000, 0, 1)));
    expect(empty.paidThisMonth).toEqual([]);
  });
});

describe("listOutstandingInvoices", () => {
  it("returns only sent (unpaid) invoices with engagement context", async () => {
    const rows = await listOutstandingInvoices(ctxA());
    expect(rows).toHaveLength(1);
    expect(rows[0].amountTotal).toBe(3000);
    expect(rows[0].engagementName).toBe("Proj A");
  });
});

describe("listRecentPublishedUpdates", () => {
  it("returns only published updates (candidates excluded), newest first, with engagement name", async () => {
    const rows = await listRecentPublishedUpdates(ctxA());
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Shipped login");
    expect(rows[0].engagementName).toBe("Proj A");
  });
});

describe("publishedUpdateDates", () => {
  it("returns the published-at timestamps in the window (non-null)", async () => {
    const dates = await publishedUpdateDates(ctxA(), MONTH_START);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBeInstanceOf(Date);
  });
});
