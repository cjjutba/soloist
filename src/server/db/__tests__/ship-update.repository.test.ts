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
  createCandidate,
  findCandidateBySourceEventKey,
  renderingQualityStat,
} from "../repositories/ship-update.repository";
import { markProcessed, recordDelivery } from "../repositories/webhook-event.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "system", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "system", role: "freelancer" });

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
    { id: "ua", name: "A", email: "a@example.com" },
    { id: "ub", name: "B", email: "b@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "ua", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "ub", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj", clientDisplayName: "Acme" })).id;
});

describe("Story 3.1 — webhook_events ledger (idempotency)", () => {
  it("recordDelivery returns true the first time, false on a duplicate gh_delivery_id", async () => {
    expect(await recordDelivery({ ghDeliveryId: "d1", eventType: "push" })).toBe(true);
    expect(await recordDelivery({ ghDeliveryId: "d1", eventType: "push" })).toBe(false);
    expect(await recordDelivery({ ghDeliveryId: "d2", eventType: "release" })).toBe(true);
  });

  it("markProcessed stamps processed_at", async () => {
    await recordDelivery({ ghDeliveryId: "d3", eventType: "push" });
    await markProcessed("d3");
    const [row] = await h.db!.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.ghDeliveryId, "d3"));
    expect(row.processedAt).not.toBeNull();
  });
});

describe("Story 3.1 — ship-update repository (scoped, idempotent)", () => {
  it("createCandidate inserts a freelancer-only candidate with raw_meta kept separate", async () => {
    const row = await createCandidate(ctxA(), {
      engagementId: ENG_A,
      statusTag: "shipped",
      title: "Shipped: the thing",
      source: "github",
      sourceEventKey: "pr:cj/x:1:merged",
      rawMeta: { headSha: "abc" },
    });
    expect(row?.state).toBe("candidate");
    expect(row?.tenantId).toBe(TENANT_A);
    expect(row?.statusTag).toBe("shipped");
    expect((row?.rawMeta as { headSha: string }).headSha).toBe("abc");
    expect(row?.title).not.toContain("abc"); // SHA never in the title

    const got = await findCandidateBySourceEventKey(ctxA(), ENG_A, "pr:cj/x:1:merged");
    expect(got?.id).toBe(row?.id);
  });

  it("is idempotent — a duplicate source_event_key returns null and creates no second row", async () => {
    const dup = await createCandidate(ctxA(), {
      engagementId: ENG_A,
      statusTag: "shipped",
      title: "Shipped: the thing (again)",
      source: "github",
      sourceEventKey: "pr:cj/x:1:merged",
    });
    expect(dup).toBeNull();
    const all = await h.db!
      .select()
      .from(schema.shipUpdates)
      .where(eq(schema.shipUpdates.sourceEventKey, "pr:cj/x:1:merged"));
    expect(all).toHaveLength(1);
  });

  it("NFR-2: cross-tenant cannot read another Tenant's candidate (RLS)", async () => {
    expect(await findCandidateBySourceEventKey(ctxB(), ENG_A, "pr:cj/x:1:merged")).toBeNull();
  });

  it("Story 3.4 renderingQualityStat: % of PUBLISHED candidates edited before publish (RLS-scoped)", async () => {
    // Seed published rows directly (publish/edit are Stories 3.6/3.5; candidates don't count).
    const base = { tenantId: TENANT_A, engagementId: ENG_A, statusTag: "shipped", source: "github", state: "published" } as const;
    await h.db!.insert(schema.shipUpdates).values([
      { ...base, title: "edited 1", editedAt: new Date("2026-01-01T00:00:00Z") },
      { ...base, title: "as-is" },
      { ...base, title: "edited 2", editedAt: new Date("2026-01-02T00:00:00Z") },
    ]);
    const stat = await renderingQualityStat(ctxA());
    expect(stat.published).toBe(3);
    expect(stat.edited).toBe(2);
    expect(stat.editedRate).toBeCloseTo(2 / 3);
    // Cross-tenant: B sees none of A's published rows.
    expect((await renderingQualityStat(ctxB())).published).toBe(0);
  });
});
