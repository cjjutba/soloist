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
  disconnectByInstallation,
  listInstallationIds,
  recordInstallation,
  removeInstallation,
} from "../repositories/github-installations.repository";
import { connectRepo } from "../repositories/repo-connections.repository";
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

describe("Story 3.2.1 — github-installations repository", () => {
  it("recordInstallation binds to the Tenant and is idempotent (re-record updates, no dupe)", async () => {
    await recordInstallation(ctxA(), { ghInstallationId: "555", accountLogin: "alpha-acct" });
    await recordInstallation(ctxA(), { ghInstallationId: "555", accountLogin: "alpha-renamed" });
    const ids = await listInstallationIds(ctxA());
    expect(ids.filter((i) => i === "555")).toHaveLength(1); // one row, not two
  });

  it("listInstallationIds returns only the caller Tenant's installations (RLS)", async () => {
    await recordInstallation(ctxB(), { ghInstallationId: "999", accountLogin: "beta-acct" });
    expect(await listInstallationIds(ctxA())).not.toContain("999");
    expect(await listInstallationIds(ctxB())).toContain("999");
    expect(await listInstallationIds(ctxB())).not.toContain("555");
  });

  it("removeInstallation deletes the binding", async () => {
    await recordInstallation(ctxA(), { ghInstallationId: "777", accountLogin: "x" });
    expect(await removeInstallation("777")).toBe(1);
    expect(await listInstallationIds(ctxA())).not.toContain("777");
  });

  it("disconnectByInstallation soft-disconnects that installation's active repo connections", async () => {
    await connectRepo(ctxA(), {
      engagementId: ENG_A,
      ghInstallationId: "888",
      ghRepoId: "1",
      repoFullName: "acme/by-install",
    });
    const n = await disconnectByInstallation("888");
    expect(n).toBe(1);
    // A 2nd call is a no-op (already disconnected).
    expect(await disconnectByInstallation("888")).toBe(0);
  });
});
