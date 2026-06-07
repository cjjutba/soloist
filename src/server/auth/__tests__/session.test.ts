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
import {
  getAppSession,
  requireClient,
  requireFreelancer,
  requireOnboardedClient,
} from "../session";

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

  it("maps a user with a ClientAccess row to role=client + engagementId + onboardedAt + notificationsEnabled (Story 2.4/2.5/4.4)", async () => {
    m.getSession.mockResolvedValue(noTenant);
    const onboardedAt = new Date("2026-06-02T00:00:00Z");
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt, notificationsEnabled: false });
    expect(await getAppSession()).toEqual({
      userId: "u2",
      name: "Nobody",
      email: "b@example.com",
      emailVerified: true,
      tenantId: "t9",
      role: "client",
      engagementId: "e9",
      onboardedAt,
      notificationsEnabled: false, // surfaced free off the ClientAccess row (Story 4.4)
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

  it("redirects a CLIENT session to /portal (seamless RBAC, not a 404)", async () => {
    m.getSession.mockResolvedValue(noTenant);
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt: new Date() });
    await expect(requireFreelancer()).rejects.toThrow("REDIRECT:/portal");
    expect(redirect).toHaveBeenCalledWith("/portal");
    expect(notFound).not.toHaveBeenCalled();
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

  it("redirects a freelancer session to /app (seamless RBAC, not a 404)", async () => {
    m.getSession.mockResolvedValue(freelancer);
    await expect(requireClient()).rejects.toThrow("REDIRECT:/app");
    expect(redirect).toHaveBeenCalledWith("/app");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    m.getSession.mockResolvedValue(null);
    await expect(requireClient()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("requireOnboardedClient (/portal surfaces — onboarding gate)", () => {
  it("returns the client ctx when onboarding is complete", async () => {
    m.getSession.mockResolvedValue(noTenant);
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt: new Date() });
    const s = await requireOnboardedClient();
    expect(s.role).toBe("client");
    expect(s.engagementId).toBe("e9");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an un-onboarded client to the Onboarding hero", async () => {
    m.getSession.mockResolvedValue(noTenant);
    m.findClientAccess.mockResolvedValue({ tenantId: "t9", engagementId: "e9", userId: "u2", role: "client", onboardedAt: null });
    await expect(requireOnboardedClient()).rejects.toThrow("REDIRECT:/portal/onboarding");
    expect(redirect).toHaveBeenCalledWith("/portal/onboarding");
  });

  it("redirects a freelancer presented to a portal surface to /app", async () => {
    m.getSession.mockResolvedValue(freelancer);
    await expect(requireOnboardedClient()).rejects.toThrow("REDIRECT:/app");
    expect(redirect).toHaveBeenCalledWith("/app");
    expect(notFound).not.toHaveBeenCalled();
  });
});
