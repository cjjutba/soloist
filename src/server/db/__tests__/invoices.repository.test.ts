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
  createInvoice,
  getClientInvoice,
  getInvoice,
  listClientInvoices,
  listInvoices,
  loadInvoiceSentContext,
  markInvoicePaid,
  markInvoiceSent,
} from "../repositories/invoices.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_A2 = "";
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
  ENG_A2 = (await createEngagement(ctxA(), { name: "Proj A2", clientDisplayName: "Globex" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Initech" })).id;
});

describe("Story 5.1 — invoices repository", () => {
  it("createInvoice assigns per-Tenant numbers atomically (1, then 2) + computes amount_total server-side", async () => {
    const first = await createInvoice(ctxA(), {
      engagementId: ENG_A,
      lineItems: [line("Design", 2, 5000), line("Build", 1, 250)],
      currency: "PHP",
    });
    expect(first.number).toBe(1);
    expect(first.status).toBe("draft");
    expect(first.amountTotal).toBe(2 * 5000 + 250); // server-computed, not client-sent

    const second = await createInvoice(ctxA(), {
      engagementId: ENG_A2,
      lineItems: [line("Hours", 2.5, 10000)],
      currency: "USD",
    });
    expect(second.number).toBe(2); // per-Tenant sequence advanced
    expect(second.amountTotal).toBe(25000);
  });

  it("the per-Tenant counter is independent across Tenants (Tenant B starts at 1)", async () => {
    const b = await createInvoice(ctxB(), {
      engagementId: ENG_B,
      lineItems: [line("Consult", 1, 9999)],
      currency: "PHP",
    });
    expect(b.number).toBe(1); // Tenant B's own sequence, not 3
  });

  it("listInvoices is engagement-scoped + newest-number-first", async () => {
    const rowsA = await listInvoices(ctxA(), ENG_A);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].number).toBe(1);
    expect(rowsA[0].currency).toBe("PHP");
    // ENG_A2 has its own invoice (#2), not ENG_A's.
    const rowsA2 = await listInvoices(ctxA(), ENG_A2);
    expect(rowsA2.map((r) => r.number)).toEqual([2]);
  });

  it("getInvoice returns null cross-Tenant (RLS) — Tenant B can't read Tenant A's invoice", async () => {
    const [aInvoice] = await listInvoices(ctxA(), ENG_A);
    expect(await getInvoice(ctxA(), aInvoice.id)).not.toBeNull(); // own → visible
    expect(await getInvoice(ctxB(), aInvoice.id)).toBeNull(); // foreign tenant → RLS null
  });
});

describe("Story 5.2 — send, manual status, and the Client (draft-excluding) reads", () => {
  let invId = ""; // ENG_A's invoice #1 (draft from the 5.1 block) — transitions draft→sent→paid here
  // A Client ctx (engagement-scoped) — repo reads key RLS off the ctx GUCs, no client_access needed.
  const clientA = (): TenantContext => ({ tenantId: TENANT_A, userId: "client_a", role: "client", engagementId: ENG_A });
  const clientA2 = (): TenantContext => ({ tenantId: TENANT_A, userId: "client_a2", role: "client", engagementId: ENG_A2 });

  beforeAll(async () => {
    invId = (await listInvoices(ctxA(), ENG_A))[0].id;
  });

  it("markInvoiceSent: draft → sent returns the row; a re-send → null (the atomic guard fires one event)", async () => {
    const sent = await markInvoiceSent(ctxA(), invId);
    expect(sent?.status).toBe("sent");
    expect(await markInvoiceSent(ctxA(), invId)).toBeNull(); // already sent → no second transition/event
  });

  it("markInvoicePaid: a Draft can NOT skip to Paid; a Sent → Paid", async () => {
    const draft = (await listInvoices(ctxA(), ENG_A2))[0];
    expect(draft.status).toBe("draft");
    expect(await markInvoicePaid(ctxA(), draft.id)).toBeNull(); // Draft→Sent→Paid only (no skip)
    const paid = await markInvoicePaid(ctxA(), invId); // invId is 'sent' from the prior test
    expect(paid?.status).toBe("paid");
  });

  it("listClientInvoices excludes drafts (sent/paid only); getClientInvoice is null for a Draft", async () => {
    // ENG_A's invoice is now 'paid' → in the Client list; ENG_A2's is still 'draft' → never shown.
    const clientList = await listClientInvoices(clientA(), ENG_A);
    expect(clientList).toHaveLength(1);
    expect(clientList[0].status).toBe("paid");

    const draft = (await listInvoices(ctxA(), ENG_A2))[0];
    expect(await getClientInvoice(clientA2(), draft.id)).toBeNull(); // a Draft never leaks to the Client
    expect((await getClientInvoice(clientA(), invId))?.id).toBe(invId); // the paid invoice IS returned
  });

  it("loadInvoiceSentContext joins the email data (number/amount/currency/client/tenant; branding optional)", async () => {
    const ctx = await loadInvoiceSentContext(invId);
    expect(ctx).toMatchObject({
      number: 1,
      currency: "PHP",
      engagementId: ENG_A,
      tenantId: TENANT_A,
      clientDisplayName: "Acme",
      tenantName: "Alpha",
    });
    expect(ctx?.amountTotal).toBe(2 * 5000 + 250); // the 5.1-seeded line items
    expect(ctx?.logoUrl).toBeNull(); // no branding for Alpha → the email falls back
  });
});
