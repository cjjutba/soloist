import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { clientAccess, user } from "../schema";
import type { TenantContext } from "../context";

const h = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle> | undefined }));
vi.mock("../index", () => ({
  get db() {
    return h.db;
  },
}));

import {
  clientChatUnread,
  createMessage,
  freelancerChatUnread,
  freelancerChatUnreadByEngagement,
  getClientLastRead,
  getFreelancerLastRead,
  listMessages,
  markChatReadAsClient,
  markChatReadAsFreelancer,
} from "../repositories/messages.repository";
import { createEngagement } from "../repositories/engagements.repository";
import { provisionTenant } from "../repositories/tenants.repository";

let TENANT_A = "";
let TENANT_B = "";
let ENG_A = "";
let ENG_A2 = "";
let ENG_B = "";
const ctxA = (): TenantContext => ({ tenantId: TENANT_A, userId: "owner_a", role: "freelancer" });
const ctxB = (): TenantContext => ({ tenantId: TENANT_B, userId: "owner_b", role: "freelancer" });
const clientA = (): TenantContext => ({ tenantId: TENANT_A, userId: "client_a", role: "client", engagementId: ENG_A });

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
    { id: "client_a", name: "Client A", email: "ca@example.com" },
  ]);
  TENANT_A = (await provisionTenant({ ownerUserId: "owner_a", slug: "alpha", name: "Alpha" })).id;
  TENANT_B = (await provisionTenant({ ownerUserId: "owner_b", slug: "beta", name: "Beta" })).id;
  ENG_A = (await createEngagement(ctxA(), { name: "Proj A", clientDisplayName: "Acme" })).id;
  ENG_A2 = (await createEngagement(ctxA(), { name: "Proj A2", clientDisplayName: "Globex" })).id;
  ENG_B = (await createEngagement(ctxB(), { name: "Proj B", clientDisplayName: "Initech" })).id;
  // A real ClientAccess row for ENG_A so the client read-cursor (chat_last_read_at) has a home.
  await h.db.insert(clientAccess).values({ tenantId: TENANT_A, engagementId: ENG_A, userId: "client_a" });
});

// Client-ctx RLS operations run FIRST (a PGlite quirk can fail a late client-scoped UPDATE — see the
// seen slice). The thread + cursors are exercised here while the connection state is fresh.
describe("client side — send, unread, read cursor", () => {
  it("createMessage + listMessages: a two-way thread reads oldest→newest with the right roles", async () => {
    await createMessage(ctxA(), { engagementId: ENG_A, senderRole: "freelancer", body: "Kicking off 🚀" });
    await createMessage(clientA(), { engagementId: ENG_A, senderRole: "client", body: "Sounds great" });
    await createMessage(ctxA(), { engagementId: ENG_A, senderRole: "freelancer", body: "First draft up" });

    const thread = await listMessages(clientA(), ENG_A);
    expect(thread.map((m) => m.body)).toEqual(["Kicking off 🚀", "Sounds great", "First draft up"]);
    expect(thread.map((m) => m.senderRole)).toEqual(["freelancer", "client", "freelancer"]);
  });

  it("clientChatUnread counts inbound (freelancer) messages newer than the client's cursor", async () => {
    // Cursor is null → both freelancer messages are unread (the client's own message never counts).
    expect(await clientChatUnread(clientA())).toBe(2);
    expect(await getFreelancerLastRead(clientA(), ENG_A)).toBeNull(); // freelancer hasn't read yet

    await markChatReadAsClient(clientA());
    expect(await clientChatUnread(clientA())).toBe(0);

    // A new inbound message after reading → unread again (just the one).
    await createMessage(ctxA(), { engagementId: ENG_A, senderRole: "freelancer", body: "Ping" });
    expect(await clientChatUnread(clientA())).toBe(1);
  });
});

describe("freelancer side — unread + read cursor", () => {
  it("freelancerChatUnread counts inbound (client) messages newer than the freelancer's cursor", async () => {
    // From the thread above ENG_A already has one client message ("Sounds great") and no freelancer cursor.
    expect(await freelancerChatUnread(ctxA(), ENG_A)).toBe(1);
    expect(await getClientLastRead(ctxA(), ENG_A)).toBeInstanceOf(Date); // the client read above

    await markChatReadAsFreelancer(ctxA(), ENG_A);
    expect(await freelancerChatUnread(ctxA(), ENG_A)).toBe(0);

    await createMessage(clientA(), { engagementId: ENG_A, senderRole: "client", body: "Looks good!" });
    expect(await freelancerChatUnread(ctxA(), ENG_A)).toBe(1);
  });

  it("freelancerChatUnreadByEngagement maps per-engagement unread (the dashboard badge)", async () => {
    // ENG_A2 has its own unread client message; ENG_A has the 1 from the prior test.
    await createMessage(
      { tenantId: TENANT_A, userId: "client_a", role: "client", engagementId: ENG_A2 },
      { engagementId: ENG_A2, senderRole: "client", body: "Hi from A2" },
    );
    const map = await freelancerChatUnreadByEngagement(ctxA());
    expect(map.get(ENG_A)).toBe(1);
    expect(map.get(ENG_A2)).toBe(1);
  });
});

describe("tenant isolation (RLS)", () => {
  it("a foreign tenant cannot read another tenant's thread, and its dashboard map excludes it", async () => {
    // Tenant B can't see Tenant A's ENG_A messages.
    expect(await listMessages(ctxB(), ENG_A)).toEqual([]);

    // A client message in Tenant B's ENG_B never appears in Tenant A's unread map.
    await createMessage(
      { tenantId: TENANT_B, userId: "owner_b", role: "client", engagementId: ENG_B },
      { engagementId: ENG_B, senderRole: "client", body: "B only" },
    );
    const mapA = await freelancerChatUnreadByEngagement(ctxA());
    expect(mapA.has(ENG_B)).toBe(false);
    // Tenant B sees its own.
    expect((await freelancerChatUnreadByEngagement(ctxB())).get(ENG_B)).toBe(1);
  });
});
