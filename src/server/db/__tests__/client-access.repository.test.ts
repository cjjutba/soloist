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
  acceptInvitationTx,
  findClientAccessByUserId,
  findClientRecipientForEngagement,
  InvitationAlreadyAcceptedError,
  markOnboarded,
} from "../repositories/client-access.repository";
import {
  findInvitationByTokenHash,
  upsertInvitation,
} from "../repositories/invitations.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let ENG_A = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "owner_a", role: "freelancer" });
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
    { id: "owner_a", name: "Owner", email: "owner@example.com" },
    { id: "client_user", name: "Client", email: "client@acme.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "owner_a", slug: "alpha", name: "Alpha" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj", clientDisplayName: "Acme" })).id;
  await upsertInvitation(ctxA(), {
    engagementId: ENG_A,
    email: "client@acme.com",
    tokenHash: "the-hash",
    expiresAt: future,
  });
});

describe("Story 2.4 — pre-auth + scope-resolution reads", () => {
  it("findInvitationByTokenHash finds the invitation UNSCOPED (pre-auth, by hash)", async () => {
    const inv = await findInvitationByTokenHash("the-hash");
    expect(inv?.engagementId).toBe(ENG_A);
    expect(inv?.tenantId).toBe(TENANT_A);
    expect(inv?.email).toBe("client@acme.com");
    expect(await findInvitationByTokenHash("wrong-hash")).toBeNull();
  });

  it("acceptInvitationTx inserts ClientAccess + stamps the invitation in one tx", async () => {
    const clientCtx: TenantContext = {
      tenantId: TENANT_A,
      engagementId: ENG_A,
      userId: "client_user",
      role: "client",
    };
    const access = await acceptInvitationTx(clientCtx, {
      engagementId: ENG_A,
      userId: "client_user",
      invitedAt: null,
    });
    expect(access.tenantId).toBe(TENANT_A);
    expect(access.engagementId).toBe(ENG_A);
    expect(access.userId).toBe("client_user");
    expect(access.role).toBe("client");

    // The invitation is now accepted.
    const [inv] = await h.db!
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.engagementId, ENG_A));
    expect(inv.acceptedAt).not.toBeNull();
  });

  it("findClientAccessByUserId resolves the access by the user's own id", async () => {
    const access = await findClientAccessByUserId("client_user");
    expect(access?.engagementId).toBe(ENG_A);
    expect(access?.tenantId).toBe(TENANT_A);
    expect(await findClientAccessByUserId("nobody")).toBeNull();
  });

  it("a SECOND acceptInvitationTx on the already-accepted invite is rejected (atomic single-use)", async () => {
    // The first accept (test above) stamped the invitation. A replay must throw and write
    // nothing (no second ClientAccess).
    await h.db!.insert(user).values({ id: "client_user2", name: "C2", email: "c2@acme.com" });
    const clientCtx: TenantContext = {
      tenantId: TENANT_A,
      engagementId: ENG_A,
      userId: "client_user2",
      role: "client",
    };
    await expect(
      acceptInvitationTx(clientCtx, { engagementId: ENG_A, userId: "client_user2", invitedAt: null }),
    ).rejects.toBeInstanceOf(InvitationAlreadyAcceptedError);
    // No second access row was created.
    const all = await h.db!
      .select()
      .from(schema.clientAccess)
      .where(eq(schema.clientAccess.engagementId, ENG_A));
    expect(all).toHaveLength(1);
  });

  it("markOnboarded stamps onboarded_at once, idempotently (Story 2.5)", async () => {
    const clientCtx: TenantContext = {
      tenantId: TENANT_A,
      engagementId: ENG_A,
      userId: "client_user",
      role: "client",
    };
    await markOnboarded(clientCtx);
    const [first] = await h.db!
      .select()
      .from(schema.clientAccess)
      .where(eq(schema.clientAccess.engagementId, ENG_A));
    expect(first.onboardedAt).not.toBeNull();

    // A second call is a no-op (the IS NULL guard) — the timestamp is unchanged.
    await markOnboarded(clientCtx);
    const [second] = await h.db!
      .select()
      .from(schema.clientAccess)
      .where(eq(schema.clientAccess.engagementId, ENG_A));
    expect(second.onboardedAt).toEqual(first.onboardedAt);
  });
});

describe("Story 3.6 — the publish fan-out recipient lookup", () => {
  it("findClientRecipientForEngagement returns the Engagement's Client (joined to user.email)", async () => {
    // `client_user` accepted ENG_A in the 2.4 block above.
    const recipient = await findClientRecipientForEngagement(ENG_A);
    expect(recipient).toEqual({ userId: "client_user", email: "client@acme.com", name: "Client" });
  });

  it("returns null for an Engagement whose Client hasn't accepted yet", async () => {
    const eng = (await createEngagement(ctxA(), { name: "No client yet", clientDisplayName: "Nobody" })).id;
    expect(await findClientRecipientForEngagement(eng)).toBeNull();
  });
});
