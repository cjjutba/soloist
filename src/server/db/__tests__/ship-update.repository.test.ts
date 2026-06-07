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
  countCandidatesByEngagement,
  createCandidate,
  dismissCandidate,
  dismissCandidates,
  findCandidateBySourceEventKey,
  listCandidates,
  listPublishedUpdates,
  publishShipUpdate,
  publishShipUpdates,
  renderingQualityStat,
  updateCandidate,
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

describe("Story 3.5 — curation queue (list / edit / dismiss / count)", () => {
  let ENG_C = "";
  /** Insert a ship_update directly (bypasses RLS for setup, like the seeds above). */
  const mk = async (
    engagementId: string,
    title: string,
    opts: { state?: string; createdAt?: Date; tenantId?: string } = {},
  ): Promise<string> => {
    const [row] = await h.db!
      .insert(schema.shipUpdates)
      .values({
        tenantId: opts.tenantId ?? TENANT_A,
        engagementId,
        statusTag: "in_progress",
        title,
        source: "github",
        state: opts.state ?? "candidate",
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      })
      .returning();
    return row.id;
  };

  beforeAll(async () => {
    ENG_C = (await createEngagement(ctxA(), { name: "Curate", clientDisplayName: "Acme" })).id;
  });

  it("listCandidates: only state='candidate' for the engagement, newest-first; RLS-isolated", async () => {
    const eng = (await createEngagement(ctxA(), { name: "List", clientDisplayName: "Acme" })).id;
    await mk(eng, "oldest", { createdAt: new Date("2026-01-01T00:00:00Z") });
    await mk(eng, "newest", { createdAt: new Date("2026-03-01T00:00:00Z") });
    await mk(eng, "middle", { createdAt: new Date("2026-02-01T00:00:00Z") });
    await mk(eng, "dismissed", { state: "dismissed", createdAt: new Date("2026-04-01T00:00:00Z") });
    await mk(eng, "published", { state: "published", createdAt: new Date("2026-05-01T00:00:00Z") });

    const list = await listCandidates(ctxA(), eng);
    expect(list.map((r) => r.title)).toEqual(["newest", "middle", "oldest"]); // candidates only, desc
    expect(await listCandidates(ctxB(), eng)).toHaveLength(0); // RLS
  });

  it("updateCandidate: patches allow-listed title/summary/statusTag + stamps edited_at; state unmoved", async () => {
    const id = await mk(ENG_C, "raw title");
    const row = await updateCandidate(ctxA(), id, {
      title: "Clean title",
      summary: "Plain detail",
      statusTag: "shipped",
    });
    expect(row?.title).toBe("Clean title");
    expect(row?.summary).toBe("Plain detail");
    expect(row?.statusTag).toBe("shipped");
    expect(row?.state).toBe("candidate");
    expect(row?.editedAt).not.toBeNull();
    // a pure status re-tag also stamps edited_at; summary can be cleared to null.
    const cleared = await updateCandidate(ctxA(), id, { summary: null });
    expect(cleared?.summary).toBeNull();
  });

  it("updateCandidate: null for a foreign tenant (RLS) and for a non-candidate row (state guard)", async () => {
    const id = await mk(ENG_C, "guarded");
    expect(await updateCandidate(ctxB(), id, { title: "hijack" })).toBeNull(); // RLS
    const pub = await mk(ENG_C, "already-published", { state: "published" });
    expect(await updateCandidate(ctxA(), pub, { title: "x" })).toBeNull(); // state guard
  });

  it("dismissCandidate: candidate → dismissed once, then null on replay / foreign tenant", async () => {
    const id = await mk(ENG_C, "noise");
    expect((await dismissCandidate(ctxA(), id))?.state).toBe("dismissed");
    expect(await dismissCandidate(ctxA(), id)).toBeNull(); // idempotent
    expect(await dismissCandidate(ctxB(), id)).toBeNull(); // RLS
  });

  it("dismissCandidates: bulk-dismisses only candidates, reports the count; empty → 0", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Bulk", clientDisplayName: "Acme" })).id;
    const a = await mk(eng, "a");
    const b = await mk(eng, "b");
    const pub = await mk(eng, "pub", { state: "published" });
    expect(await dismissCandidates(ctxA(), [a, b, pub])).toEqual({ count: 2 }); // pub skipped
    expect(await dismissCandidates(ctxA(), [])).toEqual({ count: 0 });
    expect(await listCandidates(ctxA(), eng)).toHaveLength(0);
  });

  it("countCandidatesByEngagement: groups, ignores dismissed/published, RLS-isolated", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Count", clientDisplayName: "Acme" })).id;
    await mk(eng, "c1");
    await mk(eng, "c2");
    await mk(eng, "d", { state: "dismissed" });
    await mk(eng, "p", { state: "published" });
    expect((await countCandidatesByEngagement(ctxA())).get(eng)).toBe(2);
    expect((await countCandidatesByEngagement(ctxB())).get(eng)).toBeUndefined(); // RLS
  });
});

describe("Story 3.6 — the publish gate + the client-safe feed read", () => {
  const mk = async (
    engagementId: string,
    title: string,
    opts: { state?: string; rawMeta?: unknown } = {},
  ): Promise<string> => {
    const [row] = await h.db!
      .insert(schema.shipUpdates)
      .values({
        tenantId: TENANT_A,
        engagementId,
        statusTag: "shipped",
        title,
        source: "github",
        state: opts.state ?? "candidate",
        rawMeta: opts.rawMeta ?? null,
      })
      .returning();
    return row.id;
  };

  it("publishShipUpdate flips candidate→published, stamps published_at, bumps last_activity; idempotent + RLS", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Pub", clientDisplayName: "Acme" })).id;
    await h.db!
      .update(schema.engagements)
      .set({ lastActivityAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(schema.engagements.id, eng));
    const id = await mk(eng, "ready");

    const row = await publishShipUpdate(ctxA(), id);
    expect(row?.state).toBe("published");
    expect(row?.publishedAt).not.toBeNull();
    const [e] = await h.db!.select().from(schema.engagements).where(eq(schema.engagements.id, eng));
    expect(e.lastActivityAt.getTime()).toBeGreaterThan(new Date("2020-01-01T00:00:00Z").getTime());

    expect(await publishShipUpdate(ctxA(), id)).toBeNull(); // replay (already published)
    const id2 = await mk(eng, "foreign");
    expect(await publishShipUpdate(ctxB(), id2)).toBeNull(); // RLS — Tenant B can't publish A's
    const dis = await mk(eng, "dismissed", { state: "dismissed" });
    expect(await publishShipUpdate(ctxA(), dis)).toBeNull(); // state guard
  });

  it("publishShipUpdates bulk-publishes only candidates; empty → []", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Bulk-pub", clientDisplayName: "Acme" })).id;
    const a = await mk(eng, "a");
    const b = await mk(eng, "b");
    const pub = await mk(eng, "already", { state: "published" });
    const rows = await publishShipUpdates(ctxA(), [a, b, pub]);
    expect(rows).toHaveLength(2); // `pub` skipped by the state guard
    expect(await publishShipUpdates(ctxA(), [])).toEqual([]);
  });

  it("NFR-2/3: a CLIENT ctx reads ONLY published projections — no candidates, no rawMeta, no other engagement", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Feed", clientDisplayName: "Acme" })).id;
    const other = (await createEngagement(ctxA(), { name: "Other", clientDisplayName: "Beta" })).id;
    const p1 = await mk(eng, "shipped feature", { rawMeta: { headSha: "deadbeef" } });
    await publishShipUpdate(ctxA(), p1);
    await mk(eng, "secret candidate", { rawMeta: { headSha: "secret" } }); // still candidate
    await mk(eng, "dismissed noise", { state: "dismissed" });
    const pOther = await mk(other, "other engagement update");
    await publishShipUpdate(ctxA(), pOther);

    // A Client is scoped to their ONE engagement (RLS sets app.engagement_id).
    const clientCtx = { tenantId: TENANT_A, userId: "client-x", role: "client", engagementId: eng } as const;
    const feed = await listPublishedUpdates(clientCtx, eng);

    expect(feed.map((r) => r.title)).toEqual(["shipped feature"]); // published-only, this engagement only
    expect(feed.some((r) => r.title === "secret candidate")).toBe(false); // candidates invisible
    expect("rawMeta" in feed[0]).toBe(false); // the projection NEVER selects raw_meta
  });
});

describe("Story 3.9 — NFR-4: a repo-connection error never blocks publish or the feed", () => {
  it("publish + the published feed work while a connection is in status='error' (different tables)", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Degraded", clientDisplayName: "Acme" })).id;
    // A connection in the ERROR state (as the reconcile cron would leave it after a GitHub failure).
    await h.db!.insert(schema.repoConnections).values({
      tenantId: TENANT_A,
      engagementId: eng,
      ghInstallationId: "inst-x",
      ghRepoId: "repo-x",
      repoFullName: "cj/degraded",
      status: "error",
      lastError: "GitHub returned 503",
    });
    // A candidate exists (e.g. authored manually, or pulled before the failure).
    const [cand] = await h.db!
      .insert(schema.shipUpdates)
      .values({ tenantId: TENANT_A, engagementId: eng, statusTag: "shipped", title: "Done despite GitHub being down", source: "manual", state: "candidate" })
      .returning();

    // Publishing still works — publishShipUpdate reads ship_updates/engagements, never repo_connections.
    const published = await publishShipUpdate(ctxA(), cand.id);
    expect(published?.state).toBe("published");

    // And the Client feed still serves it.
    const clientCtx = { tenantId: TENANT_A, userId: "client-y", role: "client", engagementId: eng } as const;
    const feed = await listPublishedUpdates(clientCtx, eng);
    expect(feed.map((r) => r.title)).toEqual(["Done despite GitHub being down"]);
  });
});

describe("Story 3.8 — manual ship updates (createCandidate, source='manual')", () => {
  it("a manual create inserts a candidate; two manual creates for one engagement BOTH insert (null keys don't collide)", async () => {
    const eng = (await createEngagement(ctxA(), { name: "Manual", clientDisplayName: "Acme" })).id;
    const a = await createCandidate(ctxA(), {
      engagementId: eng,
      statusTag: "shipped",
      title: "Wrote the proposal",
      summary: "By hand",
      source: "manual",
    });
    expect(a?.source).toBe("manual");
    expect(a?.state).toBe("candidate");
    expect(a?.sourceEventKey).toBeNull();

    // A second manual create (also null source_event_key) must NOT be swallowed by the dedup.
    const b = await createCandidate(ctxA(), {
      engagementId: eng,
      statusTag: "next",
      title: "Planned the redesign",
      source: "manual",
    });
    expect(b).not.toBeNull();
    expect(b?.id).not.toBe(a?.id);

    // Both flow through curation: visible in the queue + counted for the dashboard badge.
    const list = await listCandidates(ctxA(), eng);
    expect(list.map((r) => r.title).sort()).toEqual(["Planned the redesign", "Wrote the proposal"]);
    expect((await countCandidatesByEngagement(ctxA())).get(eng)).toBe(2);
  });
});
