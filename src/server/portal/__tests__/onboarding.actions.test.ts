import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ requireClient: vi.fn(), markOnboarded: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireClient: m.requireClient }));
vi.mock("@/server/db/repositories/client-access.repository", () => ({
  markOnboarded: m.markOnboarded,
}));

import { completeOnboardingAction } from "../onboarding.actions";

const CTX = { tenantId: "t1", engagementId: "e1", userId: "u1", role: "client" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.requireClient.mockResolvedValue(CTX);
  m.markOnboarded.mockResolvedValue(undefined);
});

describe("completeOnboardingAction (Story 2.5)", () => {
  it("stamps the flag through the client ctx and returns ok", async () => {
    const r = await completeOnboardingAction();
    expect(r).toEqual({ ok: true });
    expect(m.markOnboarded).toHaveBeenCalledWith(CTX);
  });

  it("returns ok:false (never throws) if the repo fails", async () => {
    m.markOnboarded.mockRejectedValue(new Error("db down"));
    const r = await completeOnboardingAction();
    expect(r).toEqual({ ok: false });
  });
});
