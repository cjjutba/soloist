import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  resolveNotifiableRecipient: vi.fn(),
  createNotification: vi.fn(),
  loadShipPublishedContext: vi.fn(),
  sendShipPublishedEmail: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { BETTER_AUTH_URL: "https://soloist.cjjutba.com" } }));
vi.mock("@/server/db/repositories/client-access.repository", () => ({
  resolveNotifiableRecipient: m.resolveNotifiableRecipient,
}));
vi.mock("@/server/db/repositories/notifications.repository", () => ({
  createNotification: m.createNotification,
  loadShipPublishedContext: m.loadShipPublishedContext,
}));
vi.mock("@/server/ship-feed/ship-published-email", () => ({ sendShipPublishedEmail: m.sendShipPublishedEmail }));
vi.mock("../../client", () => ({ inngest: { createFunction: () => ({}) } }));

import { handleShipPublished } from "../ship-published";

const data = { shipUpdateId: "su1", engagementId: "eng1", tenantId: "t1" };
const recipient = { userId: "client-1", email: "client@example.com", name: "Maya", notificationsEnabled: true };
const ctx = {
  statusTag: "shipped",
  title: "Made sign-in faster",
  summary: "quicker",
  state: "published",
  engagementId: "eng1",
  tenantId: "t1",
  clientDisplayName: "Maya",
  tenantName: "Alpha",
  logoUrl: null,
  accentHex: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.resolveNotifiableRecipient.mockResolvedValue({ status: "ok", recipient });
  m.createNotification.mockResolvedValue({ id: "n1" });
  m.loadShipPublishedContext.mockResolvedValue(ctx);
  m.sendShipPublishedEmail.mockResolvedValue(undefined);
});

describe("Story 3.6 — ship-published fan-out", () => {
  it("recipient found → notification (system ctx) + branded email", async () => {
    const res = await handleShipPublished(data);
    expect(res).toEqual({ status: "sent" });
    expect(m.createNotification).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "system", role: "freelancer" },
      { engagementId: "eng1", userId: "client-1", type: "ship_published", shipUpdateId: "su1" },
    );
    expect(m.sendShipPublishedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        title: "Made sign-in faster",
        accentHex: "#5b5bd6", // Soloist Iris default — Tenant set no accent
        portalUrl: "https://soloist.cjjutba.com/portal",
      }),
    );
  });

  it("no recipient (client hasn't accepted) → no-op, neither notification nor email", async () => {
    m.resolveNotifiableRecipient.mockResolvedValue({ status: "no-recipient" });
    const res = await handleShipPublished(data);
    expect(res).toEqual({ status: "no-recipient" });
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.sendShipPublishedEmail).not.toHaveBeenCalled();
  });

  it("Story 4.4: client muted notifications → no-op, neither notification nor email (feed still shows it)", async () => {
    m.resolveNotifiableRecipient.mockResolvedValue({ status: "muted" });
    const res = await handleShipPublished(data);
    expect(res).toEqual({ status: "muted" });
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.sendShipPublishedEmail).not.toHaveBeenCalled();
  });

  it("a non-published context (dismissed/edited race) → notification kept, email skipped", async () => {
    m.loadShipPublishedContext.mockResolvedValue({ ...ctx, state: "dismissed" });
    const res = await handleShipPublished(data);
    expect(res).toEqual({ status: "stale" });
    expect(m.createNotification).toHaveBeenCalled();
    expect(m.sendShipPublishedEmail).not.toHaveBeenCalled();
  });
});
