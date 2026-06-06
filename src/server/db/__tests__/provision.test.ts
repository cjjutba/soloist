import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../schema";
import { tenants, user } from "../schema";

// Hoisted holder the (also hoisted) vi.mock factory reads via a live getter, so the
// REAL repository + withTenant run against this PGlite db instead of the Neon client
// — and "@/env"/DATABASE_URL are never touched. beforeAll populates h.db.
const h = vi.hoisted(() => ({ db: undefined as ReturnType<typeof drizzle> | undefined }));

vi.mock("../index", () => ({
  get db() {
    return h.db;
  },
}));

// Imported AFTER the mock (vitest hoists vi.mock above all imports regardless).
import {
  AlreadyProvisionedError,
  SlugTakenError,
  activateTenant,
  getTenant,
  provisionTenant,
} from "../repositories/tenants.repository";

// Distinct owner per test → tests are order-independent (no shared provisioned state).
const USERS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"] as const;
const fc = (id: string) => ({ tenantId: "", userId: id, role: "freelancer" as const });

beforeAll(async () => {
  const client = new PGlite();
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) await client.exec(s);
    }
  }
  h.db = drizzle(client, { schema });
  await h.db.insert(user).values(USERS.map((id) => ({ id, name: id, email: `${id}@example.com` })));
});

describe("Story 1.3 — Tenant provisioning (inside the NFR-2 choke point)", () => {
  it("provisions a Tenant owned by the Freelancer and stamps user.tenantId (AC-1)", async () => {
    const t = await provisionTenant({ ownerUserId: "u1", slug: "studio-1", name: "Studio 1" });
    expect(t.slug).toBe("studio-1");
    expect(t.ownerUserId).toBe("u1");
    expect(t.activatedAt).toBeNull(); // not active until email verification (AC-2)

    const [u] = await h.db!.select().from(user).where(eq(user.id, "u1"));
    expect(u.tenantId).toBe(t.id); // forward link for session→Tenant resolution (1.4)

    const got = await getTenant({ ...fc("u1"), tenantId: t.id });
    expect(got?.id).toBe(t.id);
  });

  it("rejects a duplicate slug with SlugTakenError + leaves the second owner unlinked (AC-3)", async () => {
    await provisionTenant({ ownerUserId: "u2", slug: "shared-slug", name: "First" });
    await expect(
      provisionTenant({ ownerUserId: "u3", slug: "shared-slug", name: "Second" }),
    ).rejects.toBeInstanceOf(SlugTakenError);
    const [u] = await h.db!.select().from(user).where(eq(user.id, "u3"));
    expect(u.tenantId).toBeNull(); // tx rolled back — no orphan link
  });

  it("rejects a second Tenant for the same owner with AlreadyProvisionedError (AC-1)", async () => {
    await provisionTenant({ ownerUserId: "u4", slug: "studio-4", name: "Studio 4" });
    await expect(
      provisionTenant({ ownerUserId: "u4", slug: "studio-4b", name: "Studio 4b" }),
    ).rejects.toBeInstanceOf(AlreadyProvisionedError);
  });

  it("activateTenant stamps activated_at once, idempotently (AC-2)", async () => {
    const t = await provisionTenant({ ownerUserId: "u5", slug: "studio-5", name: "Studio 5" });
    expect(t.activatedAt).toBeNull();
    const first = await activateTenant("u5", t.id);
    expect(first).toHaveLength(1); // stamped
    const stampedAt = (await getTenant({ ...fc("u5"), tenantId: t.id }))?.activatedAt;
    expect(stampedAt).not.toBeNull();
    // Re-activation (e.g. an email change re-firing afterEmailVerification) is a no-op.
    const second = await activateTenant("u5", t.id);
    expect(second).toHaveLength(0); // already active → not re-stamped
    const after = (await getTenant({ ...fc("u5"), tenantId: t.id }))?.activatedAt;
    expect(after).toEqual(stampedAt);
  });

  it("activateTenant does NOT activate a Tenant the caller doesn't own (owner-binding)", async () => {
    const t = await provisionTenant({ ownerUserId: "u6", slug: "studio-6", name: "Studio 6" });
    const updated = await activateTenant("u7", t.id); // wrong owner
    expect(updated).toHaveLength(0); // 0 rows — owner_user_id predicate blocks it
    const got = await getTenant({ ...fc("u6"), tenantId: t.id });
    expect(got?.activatedAt).toBeNull(); // still inactive
  });

  it("RLS still fails closed on an unscoped read after the new columns/FK (NFR-2 regression)", async () => {
    const rows = await h.db!.transaction(async (tx) => {
      await tx.execute(sql`set local role soloist_app`);
      return tx.select().from(tenants); // no GUC set → 0 rows
    });
    expect(rows).toHaveLength(0);
  });
});
