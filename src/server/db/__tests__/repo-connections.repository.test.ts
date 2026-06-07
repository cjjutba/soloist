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
  connectRepo,
  disconnectRepo,
  findEngagementForRepo,
  getConnection,
  listActiveRepoFullNames,
  listConnections,
  listConnectionsForReconcile,
  markConnectionError,
  markConnectionPulled,
} from "../repositories/repo-connections.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_B = "";
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
  ENG_A = (await createEngagement(ctxA(), { name: "Proj A", clientDisplayName: "Acme" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Beta Co" })).id;
});

describe("Story 3.2 — repo-connections repository", () => {
  it("connectRepo inserts a scoped, 'connected' row and listConnections returns it", async () => {
    const row = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "100",
      repoFullName: "acme/web",
    });
    expect(row.status).toBe("connected");
    expect(row.tenantId).toBe(TENANT_A);

    const list = await listConnections(ctxA(), ENG_A);
    expect(list.map((r) => r.repoFullName)).toContain("acme/web");
  });

  it("a 2nd ACTIVE connect of the same repo throws (partial unique)", async () => {
    await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "200",
      repoFullName: "acme/dup",
    });
    await expect(
      connectRepo(ctxA(), {
        engagementId: ENG_A,
        ghInstallationId: "inst-1",
        ghRepoId: "200",
        repoFullName: "acme/dup",
      }),
    ).rejects.toThrow();
  });

  it("disconnectRepo flips status to 'disconnected' and frees the repo to reconnect", async () => {
    const c = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "300",
      repoFullName: "acme/re",
    });
    const off = await disconnectRepo(ctxA(), c.id);
    expect(off?.status).toBe("disconnected");

    // No active row now → a fresh connect succeeds.
    const again = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "300",
      repoFullName: "acme/re",
    });
    expect(again.status).toBe("connected");
  });

  it("findEngagementForRepo resolves an ACTIVE connection; null for disconnected + unknown", async () => {
    await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "400",
      repoFullName: "acme/resolve",
    });
    const hit = await findEngagementForRepo("acme/resolve");
    expect(hit).toEqual({ tenantId: TENANT_A, engagementId: ENG_A });

    expect(await findEngagementForRepo("acme/never-connected")).toBeNull();

    const c = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "500",
      repoFullName: "acme/gone",
    });
    await disconnectRepo(ctxA(), c.id);
    expect(await findEngagementForRepo("acme/gone")).toBeNull();
  });

  it("listActiveRepoFullNames returns the Tenant's active repos and excludes disconnected", async () => {
    const c = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-1",
      ghRepoId: "700",
      repoFullName: "acme/active-list",
    });
    const names = await listActiveRepoFullNames(ctxA());
    expect(names).toContain("acme/active-list");
    await disconnectRepo(ctxA(), c.id);
    expect(await listActiveRepoFullNames(ctxA())).not.toContain("acme/active-list");
  });

  it("Story 3.3 reconcile reads/writes: list non-disconnected, mark pulled/error, exclude disconnected", async () => {
    const c = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "rc-1",
      ghRepoId: "9",
      repoFullName: "acme/reconcile",
    });
    expect((await listConnectionsForReconcile()).find((r) => r.id === c.id)).toBeTruthy();

    await markConnectionError(c.id, "boom");
    const errored = (await listConnectionsForReconcile()).find((r) => r.id === c.id);
    expect(errored).toBeTruthy(); // an errored row is still pulled (to retry)

    await markConnectionPulled(c.id);
    const pulled = (await listConnectionsForReconcile()).find((r) => r.id === c.id);
    expect(pulled?.lastPullAt).not.toBeNull();

    await disconnectRepo(ctxA(), c.id);
    expect((await listConnectionsForReconcile()).find((r) => r.id === c.id)).toBeUndefined();
  });

  it("NFR-2: a Freelancer can't disconnect another Tenant's connection (RLS → null)", async () => {
    const bConn = await connectRepo(ctxB(), {
      engagementId: ENG_B,
      ghInstallationId: "inst-2",
      ghRepoId: "600",
      repoFullName: "beta/secret",
    });
    // Tenant A tries to disconnect Tenant B's connection → RLS scopes the UPDATE to 0 rows.
    expect(await disconnectRepo(ctxA(), bConn.id)).toBeNull();
    // And A can't see it.
    expect((await listConnections(ctxA(), ENG_B)).length).toBe(0);
  });
});

describe("Story 3.9 — getConnection (the Retry read) is RLS-scoped", () => {
  it("returns the row for the owner, but NULL for another Tenant (no cross-tenant Retry by id)", async () => {
    const a = await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "inst-rt",
      ghRepoId: "rt",
      repoFullName: "alpha/retry-target",
    });
    // The owner reads it (carries the fields the Retry pull needs).
    const own = await getConnection(ctxA(), a.id);
    expect(own?.repoFullName).toBe("alpha/retry-target");
    expect(own?.ghInstallationId).toBe("inst-rt");
    // Tenant B passing A's connectionId → RLS returns 0 rows → null (can't Retry A's connection).
    expect(await getConnection(ctxB(), a.id)).toBeNull();
  });
});
