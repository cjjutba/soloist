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
  getInvitationByEngagement,
  upsertInvitation,
} from "../repositories/invitations.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_B = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "u1", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "u2", role: "freelancer" });
const future = new Date("2030-01-01T00:00:00Z");

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
    { id: "u1", name: "A", email: "a@example.com" },
    { id: "u2", name: "B", email: "b@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "u1", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "u2", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj A", clientDisplayName: "Acme" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Beta Co" })).id;
});

describe("Story 2.3 — invitations repository", () => {
  it("upsert creates an invitation, getByEngagement returns it", async () => {
    const row = await upsertInvitation(ctxA(), {
      engagementId: ENG_A,
      email: "client@acme.com",
      tokenHash: "hash1",
      expiresAt: future,
    });
    expect(row.tenantId).toBe(TENANT_A);
    expect(row.engagementId).toBe(ENG_A);
    expect(row.tokenHash).toBe("hash1");
    expect(row.acceptedAt).toBeNull();

    const got = await getInvitationByEngagement(ctxA(), ENG_A);
    expect(got?.id).toBe(row.id);
    expect(got?.email).toBe("client@acme.com");
  });

  it("a second upsert on the same Engagement replaces the row in place (resend)", async () => {
    const first = await upsertInvitation(ctxA(), {
      engagementId: ENG_A,
      email: "old@acme.com",
      tokenHash: "hashOLD",
      expiresAt: new Date("2029-01-01T00:00:00Z"),
    });
    const second = await upsertInvitation(ctxA(), {
      engagementId: ENG_A,
      email: "new@acme.com",
      tokenHash: "hashNEW",
      expiresAt: future,
    });
    expect(second.id).toBe(first.id); // same row, updated in place
    expect(second.email).toBe("new@acme.com");
    expect(second.tokenHash).toBe("hashNEW");
    expect(second.acceptedAt).toBeNull();

    // Exactly one invitation for the engagement (no duplicate).
    const all = await h.db!
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.engagementId, ENG_A));
    expect(all).toHaveLength(1);
  });

  it("NFR-2: cross-tenant read returns null (RLS)", async () => {
    await upsertInvitation(ctxB(), {
      engagementId: ENG_B,
      email: "client@beta.com",
      tokenHash: "hashB",
      expiresAt: future,
    });
    // Tenant A cannot read Tenant B's invitation.
    expect(await getInvitationByEngagement(ctxA(), ENG_B)).toBeNull();
  });
});
