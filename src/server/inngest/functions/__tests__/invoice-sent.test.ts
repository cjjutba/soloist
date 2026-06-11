import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  resolveNotifiableRecipient: vi.fn(),
  createNotification: vi.fn(),
  loadInvoiceSentContext: vi.fn(),
  sendInvoiceSentEmail: vi.fn(),
  publishToEngagement: vi.fn(),
  publishToUser: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { BETTER_AUTH_URL: "https://soloist.cjjutba.com" } }));
vi.mock("@/server/db/repositories/client-access.repository", () => ({
  resolveNotifiableRecipient: m.resolveNotifiableRecipient,
}));
vi.mock("@/server/db/repositories/notifications.repository", () => ({
  createNotification: m.createNotification,
}));
vi.mock("@/server/db/repositories/invoices.repository", () => ({
  loadInvoiceSentContext: m.loadInvoiceSentContext,
}));
vi.mock("@/server/doc-engine/invoice-sent-email", () => ({ sendInvoiceSentEmail: m.sendInvoiceSentEmail }));
vi.mock("@/server/realtime/publish", () => ({
  publishToEngagement: m.publishToEngagement,
  publishToUser: m.publishToUser,
}));
vi.mock("../../client", () => ({ inngest: { createFunction: () => ({}) } }));

import { handleInvoiceSent } from "../invoice-sent";

const data = { invoiceId: "inv1", engagementId: "eng1", tenantId: "t1" };
const recipient = { userId: "client-1", email: "client@example.com", name: "Maya", notificationsEnabled: true };
const ctx = {
  number: 7,
  amountTotal: 150000,
  currency: "PHP",
  status: "sent",
  dueAt: null,
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
  m.loadInvoiceSentContext.mockResolvedValue(ctx);
  m.sendInvoiceSentEmail.mockResolvedValue(undefined);
  m.publishToEngagement.mockResolvedValue(undefined);
  m.publishToUser.mockResolvedValue(undefined);
});

describe("Story 5.2 — invoice-sent fan-out", () => {
  it("recipient found → invoice_sent notification (system ctx, invoice_id) + branded email + realtime signals", async () => {
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "sent" });
    expect(m.createNotification).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "system", role: "freelancer" },
      { engagementId: "eng1", userId: "client-1", type: "invoice_sent", invoiceId: "inv1" },
    );
    expect(m.publishToEngagement).toHaveBeenCalledWith("eng1", "invoice.sent");
    expect(m.publishToUser).toHaveBeenCalledWith("client-1", "notification");
    expect(m.sendInvoiceSentEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        number: 7,
        amountTotal: 150000,
        currency: "PHP",
        accentHex: "#5b5bd6", // Soloist Iris default — Tenant set no accent
        invoiceUrl: "https://soloist.cjjutba.com/portal/documents/inv1",
      }),
    );
  });

  it("no recipient (client hasn't accepted) → no-op, neither notification nor email", async () => {
    m.resolveNotifiableRecipient.mockResolvedValue({ status: "no-recipient" });
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "no-recipient" });
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.sendInvoiceSentEmail).not.toHaveBeenCalled();
  });

  it("Story 4.4: client muted → no-op, neither notification nor email (the invoice is still in the portal)", async () => {
    m.resolveNotifiableRecipient.mockResolvedValue({ status: "muted" });
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "muted" });
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.sendInvoiceSentEmail).not.toHaveBeenCalled();
  });

  it("a still-draft context (a dismissed/rolled-back race) → notification kept, email skipped", async () => {
    m.loadInvoiceSentContext.mockResolvedValue({ ...ctx, status: "draft" });
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "stale" });
    expect(m.createNotification).toHaveBeenCalled();
    expect(m.sendInvoiceSentEmail).not.toHaveBeenCalled();
  });

  it("already marked Paid before the async fan-out ran → the email STILL sends (it WAS sent)", async () => {
    m.loadInvoiceSentContext.mockResolvedValue({ ...ctx, status: "paid" });
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "sent" });
    expect(m.sendInvoiceSentEmail).toHaveBeenCalled(); // 'sent' OR 'paid' both mean legitimately sent
  });

  it("the invoice is gone (loadInvoiceSentContext null) → stale, email skipped", async () => {
    m.loadInvoiceSentContext.mockResolvedValue(null);
    const res = await handleInvoiceSent(data);
    expect(res).toEqual({ status: "stale" });
    expect(m.sendInvoiceSentEmail).not.toHaveBeenCalled();
  });
});
