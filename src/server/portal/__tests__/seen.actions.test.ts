import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireClient: vi.fn(),
  markLastSeen: vi.fn(),
  markInvoiceViewed: vi.fn(),
  publishToEngagement: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ requireClient: m.requireClient }));
vi.mock("@/server/db/repositories/client-access.repository", () => ({ markLastSeen: m.markLastSeen }));
vi.mock("@/server/db/repositories/invoices.repository", () => ({ markInvoiceViewed: m.markInvoiceViewed }));
vi.mock("@/server/realtime/publish", () => ({ publishToEngagement: m.publishToEngagement }));

import { markInvoiceSeenAction, markSeenAction } from "../seen.actions";

const ENG = "11111111-1111-4111-8111-111111111111";
const INV = "22222222-2222-4222-8222-222222222222";
const clientCtx = { tenantId: "t1", userId: "u1", role: "client" as const, engagementId: ENG };

beforeEach(() => {
  vi.clearAllMocks();
  m.requireClient.mockResolvedValue(clientCtx);
  m.markLastSeen.mockResolvedValue(undefined);
  m.markInvoiceViewed.mockResolvedValue({ engagementId: ENG });
  m.publishToEngagement.mockResolvedValue(undefined);
});

describe("markSeenAction", () => {
  it("stamps last-seen for the client's OWN engagement (requireClient ctx) + signals the engagement", async () => {
    await markSeenAction();
    expect(m.markLastSeen).toHaveBeenCalledWith(clientCtx);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "seen");
  });
});

describe("markInvoiceSeenAction", () => {
  it("first view (repo returns the engagementId) → stamps + signals", async () => {
    await markInvoiceSeenAction(INV);
    expect(m.markInvoiceViewed).toHaveBeenCalledWith(clientCtx, INV);
    expect(m.publishToEngagement).toHaveBeenCalledWith(ENG, "seen");
  });

  it("a re-view (repo returns null = already seen) does NOT re-signal", async () => {
    m.markInvoiceViewed.mockResolvedValue(null);
    await markInvoiceSeenAction(INV);
    expect(m.publishToEngagement).not.toHaveBeenCalled();
  });

  it("a non-uuid invoiceId → no-op before auth (no requireClient, no stamp)", async () => {
    await markInvoiceSeenAction("not-a-uuid");
    expect(m.requireClient).not.toHaveBeenCalled();
    expect(m.markInvoiceViewed).not.toHaveBeenCalled();
  });
});
