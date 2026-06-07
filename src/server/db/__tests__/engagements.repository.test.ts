import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { user } from "../schema";
import type { TenantContext } from "../context";

// Same hoisted-mock pattern as provision.test.ts: the REAL repository + withTenant
// run against PGlite (real RLS), and "@/env"/DATABASE_URL are never touched.
const h = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle> | undefined }));

vi.mock("../index", () => ({
  get db() {
    return h.db;
  },
}));

import {
  archiveEngagement,
  compareDashboard,
  createEngagement,
  type DashboardEngagement,
  getEngagement,
  listDashboard,
  listEngagements,
  updateEngagement,
} from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "u1", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "u2", role: "freelancer" });

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
    { id: "u1", name: "Owner A", email: "a@example.com" },
    { id: "u2", name: "Owner B", email: "b@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "u1", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "u2", slug: "beta", name: "Beta" })).id;
});

describe("Story 2.1 — Engagements repository (through the NFR-2 choke point)", () => {
  it("creates an Engagement in the caller's Tenant, defaulting status=active (AC-1)", async () => {
    const e = await createEngagement(ctxA(), { name: "Website Redesign", clientDisplayName: "Acme Co" });
    expect(e.tenantId).toBe(TENANT_A);
    expect(e.name).toBe("Website Redesign");
    expect(e.clientDisplayName).toBe("Acme Co");
    expect(e.status).toBe("active");
    expect(e.scope).toBeNull();

    const got = await getEngagement(ctxA(), e.id);
    expect(got?.id).toBe(e.id);
  });

  it("lists the Tenant's Engagements newest-activity first, hiding archived by default (AC-2/AC-3)", async () => {
    const a = await createEngagement(ctxA(), { name: "Stale", clientDisplayName: "Client" });
    const b = await createEngagement(ctxA(), { name: "Fresh", clientDisplayName: "Client" });
    // Stamp explicit, distinct activity times (PGlite's now() resolution collapses
    // sub-ms transactions to the same value, so we set them directly to test ORDER BY).
    await h.db!.update(schema.engagements).set({ lastActivityAt: new Date("2026-01-01T00:00:00Z") }).where(eq(schema.engagements.id, a.id));
    await h.db!.update(schema.engagements).set({ lastActivityAt: new Date("2026-06-01T00:00:00Z") }).where(eq(schema.engagements.id, b.id));

    const list = await listEngagements(ctxA());
    const ids = list.map((r) => r.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // `b` is the more recent activity → it sorts ahead of `a`.
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(list.every((r) => r.status !== "archived")).toBe(true);
  });

  it("edits an Engagement and bumps last_activity_at (AC-2)", async () => {
    const e = await createEngagement(ctxA(), { name: "Draft", clientDisplayName: "Client" });
    const before = e.lastActivityAt;
    const updated = await updateEngagement(ctxA(), e.id, {
      name: "Final",
      clientDisplayName: "Renamed Client",
      scope: "Q3 deliverables",
      status: "paused",
    });
    expect(updated?.name).toBe("Final");
    expect(updated?.clientDisplayName).toBe("Renamed Client");
    expect(updated?.scope).toBe("Q3 deliverables");
    expect(updated?.status).toBe("paused");
    expect(updated!.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("archives (soft) — hidden from the active list, but history is preserved (AC-3)", async () => {
    const e = await createEngagement(ctxA(), { name: "To Archive", clientDisplayName: "Client" });
    const archived = await archiveEngagement(ctxA(), e.id);
    expect(archived?.status).toBe("archived");

    const active = await listEngagements(ctxA());
    expect(active.map((r) => r.id)).not.toContain(e.id);

    const all = await listEngagements(ctxA(), { includeArchived: true });
    expect(all.map((r) => r.id)).toContain(e.id);

    // Not deleted — still directly readable.
    const got = await getEngagement(ctxA(), e.id);
    expect(got?.id).toBe(e.id);
  });

  it("NFR-2: a Freelancer cannot read or edit another Tenant's Engagement (RLS)", async () => {
    const a = await createEngagement(ctxA(), { name: "A-only", clientDisplayName: "Client A" });

    // Tenant B can't see it.
    expect(await getEngagement(ctxB(), a.id)).toBeNull();
    expect((await listEngagements(ctxB())).map((r) => r.id)).not.toContain(a.id);

    // Tenant B's update affects 0 rows → null, and A's row is untouched.
    expect(await updateEngagement(ctxB(), a.id, { name: "hijacked" })).toBeNull();
    const stillA = await getEngagement(ctxA(), a.id);
    expect(stillA?.name).toBe("A-only");
  });

  it("createEngagement cannot forge a row into another Tenant (WITH CHECK)", async () => {
    // The repository always stamps ctx.tenantId, so even a Tenant-A caller writes to A.
    const e = await createEngagement(ctxA(), { name: "Stamped", clientDisplayName: "Client" });
    const [row] = await h.db!.select().from(schema.engagements).where(eq(schema.engagements.id, e.id));
    expect(row.tenantId).toBe(TENANT_A);
  });
});

describe("Story 2.2 — Dashboard read + sort", () => {
  // Minimal DashboardEngagement for the pure comparator (only the sort keys matter).
  const de = (lastActivityMs: number, candidateCount: number): DashboardEngagement =>
    ({ lastActivityAt: new Date(lastActivityMs), candidateCount }) as DashboardEngagement;

  it("compareDashboard: last-activity is the PRIMARY key (most recent first)", () => {
    const older = de(1_000, 9);
    const newer = de(2_000, 0);
    expect([older, newer].sort(compareDashboard)).toEqual([newer, older]);
  });

  it("compareDashboard: candidate-count is the SECONDARY key on equal last-activity", () => {
    const few = de(5_000, 1);
    const many = de(5_000, 7);
    expect([few, many].sort(compareDashboard)).toEqual([many, few]);
  });

  it("listDashboard returns the active Engagements, candidateCount 0, newest-activity first", async () => {
    const a = await createEngagement(ctxA(), { name: "D-stale", clientDisplayName: "Client" });
    const b = await createEngagement(ctxA(), { name: "D-fresh", clientDisplayName: "Client" });
    await h.db!
      .update(schema.engagements)
      .set({ lastActivityAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(schema.engagements.id, a.id));
    await h.db!
      .update(schema.engagements)
      .set({ lastActivityAt: new Date("2026-06-01T00:00:00Z") })
      .where(eq(schema.engagements.id, b.id));

    const dash = await listDashboard(ctxA());
    expect(dash.every((r) => r.candidateCount === 0)).toBe(true); // no candidates seeded yet
    const ids = dash.map((r) => r.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id)); // fresher first
    expect(dash.every((r) => r.status !== "archived")).toBe(true);
  });
});

describe("Story 3.5 — real candidate-count badge on the dashboard", () => {
  const seed = (engagementId: string, state: string, n: number) =>
    h.db!.insert(schema.shipUpdates).values(
      Array.from({ length: n }, (_, i) => ({
        tenantId: TENANT_A,
        engagementId,
        statusTag: "shipped",
        title: `c${i}`,
        source: "github",
        state,
      })),
    );

  it("listDashboard reflects the real count of state='candidate' rows (dismissed/published excluded)", async () => {
    const e1 = await createEngagement(ctxA(), { name: "Has-3", clientDisplayName: "Client" });
    const e2 = await createEngagement(ctxA(), { name: "Has-0", clientDisplayName: "Client" });
    await seed(e1.id, "candidate", 3);
    await seed(e1.id, "dismissed", 2); // must NOT count
    await seed(e1.id, "published", 4); // must NOT count
    // e2 gets only non-candidate rows → count stays 0 (badge absent).
    await seed(e2.id, "dismissed", 1);

    const dash = await listDashboard(ctxA());
    const byId = new Map(dash.map((r) => [r.id, r.candidateCount]));
    expect(byId.get(e1.id)).toBe(3);
    expect(byId.get(e2.id)).toBe(0);
  });

  it("NFR-2: Tenant B's dashboard never reflects Tenant A's candidates (RLS-scoped grouped count)", async () => {
    const eA = await createEngagement(ctxA(), { name: "A-cands", clientDisplayName: "Client" });
    await seed(eA.id, "candidate", 5);
    const dashB = await listDashboard(ctxB());
    expect(dashB.map((r) => r.id)).not.toContain(eA.id);
    expect(dashB.every((r) => r.candidateCount === 0)).toBe(true);
  });
});
