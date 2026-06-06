import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getSession: vi.fn(), findClientAccess: vi.fn() }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  // The real redirect()/notFound() throw control-flow errors and return `never`.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("../index", () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock("@/server/db/repositories/client-access.repository", () => ({
  findClientAccessByUserId: m.findClientAccess,
}));

import { redirect, notFound } from "next/navigation";
import { getAppSession, requireClient, requireFreelancer } from "../session";

const freelancer = {
  user: { id: "u1", name: "Casey", email: "a@example.com", emailVerified: true, tenantId: "t1" },
};
const noTenant = {
  user: { id: "u2", name: "Nobody", email: "b@example.com", emailVerified: true, tenantId: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.findClientAccess.mockResolvedValue(null); // default: not a client
});

describe("getAppSession (role derived from the data model, not the cookie)", () => {
  it("maps a tenant-owning user to role=freelancer WITHOUT a ClientAccess lookup (short-circuit)", async () => {
    m.getSession.mockResolvedValue(freelancer);
    expect(await getAppSession()).toEqual({
      userId: "u1",
      name: "Casey",
      email: "a@example.com",
      emailVerified: true,
      tenantId: "t1",
      role: "freelancer",
    });
    expect(m.findClientAccess).not.toHaveBeenCalled(); // freelancer hot path: no extra query
  });

  it("maps a user with a ClientAccess row to role=client + engagementId + onboardedAt (Story 2.4/2.5)", async () => {
    m.getSession.mockResolvedValue(noTenant);
    const onboardedAt = new Date("2026-06-02T00:00:00Z");
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt });
    expect(await getAppSession()).toEqual({
      userId: "u2",
      name: "Nobody",
      email: "b@example.com",
      emailVerified: true,
      tenantId: "t9",
      role: "client",
      engagementId: "e9",
      onboardedAt,
    });
  });

  it("maps a user with neither a Tenant nor a ClientAccess to role=null", async () => {
    m.getSession.mockResolvedValue(noTenant);
    expect((await getAppSession())?.role).toBeNull();
  });

  it("returns null when there is no session", async () => {
    m.getSession.mockResolvedValue(null);
    expect(await getAppSession()).toBeNull();
  });
});

describe("requireFreelancer (/app guard)", () => {
  it("returns the freelancer principal (also a TenantContext) for a freelancer session", async () => {
    m.getSession.mockResolvedValue(freelancer);
    expect(await requireFreelancer()).toEqual({
      userId: "u1",
      name: "Casey",
      email: "a@example.com",
      emailVerified: true,
      tenantId: "t1",
      role: "freelancer",
    });
  });

  it("redirects to /login when unauthenticated", async () => {
    m.getSession.mockResolvedValue(null);
    await expect(requireFreelancer()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("not-founds a session without a Tenant (wrong/incomplete role)", async () => {
    m.getSession.mockResolvedValue(noTenant);
    await expect(requireFreelancer()).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("not-founds an unverified freelancer session (defense-in-depth)", async () => {
    m.getSession.mockResolvedValue({
      user: { id: "u3", email: "c@example.com", emailVerified: false, tenantId: "t3" },
    });
    await expect(requireFreelancer()).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("requireClient (/portal guard — cross-surface rejection)", () => {
  it("returns the client principal (an engagement-scoped TenantContext) for a client session", async () => {
    m.getSession.mockResolvedValue(noTenant);
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt: null });
    expect(await requireClient()).toEqual({
      userId: "u2",
      name: "Nobody",
      email: "b@example.com",
      emailVerified: true,
      tenantId: "t9",
      role: "client",
      engagementId: "e9",
      onboardedAt: null,
    });
  });

  it("not-founds a freelancer session presented to the portal", async () => {
    m.getSession.mockResolvedValue(freelancer);
    await expect(requireClient()).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    m.getSession.mockResolvedValue(null);
    await expect(requireClient()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
