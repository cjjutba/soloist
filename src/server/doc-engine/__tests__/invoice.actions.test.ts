import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const INV_ID = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "owner", role: "freelancer" as const },
  getEngagement: vi.fn(),
  createInvoice: vi.fn(),
  getInvoice: vi.fn(),
  markInvoiceSent: vi.fn(),
  markInvoicePaid: vi.fn(),
  inngestSend: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/invoices.repository", () => ({
  createInvoice: m.createInvoice,
  getInvoice: m.getInvoice,
  markInvoiceSent: m.markInvoiceSent,
  markInvoicePaid: m.markInvoicePaid,
}));
vi.mock("@/server/inngest/client", () => ({ inngest: { send: m.inngestSend } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { createInvoiceAction, markInvoicePaidAction, sendInvoiceAction } from "../invoice.actions";

const validInput = () => ({
  engagementId: ENG,
  lineItems: [{ description: "Design", quantity: 2, unitAmount: 5000 }],
  currency: "PHP",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getEngagement.mockResolvedValue({ id: ENG, clientDisplayName: "Acme" });
  m.createInvoice.mockResolvedValue({ id: "inv-1" });
  m.getInvoice.mockResolvedValue({ id: "inv-1", engagementId: ENG, status: "draft" });
  m.markInvoiceSent.mockResolvedValue({ id: "inv-1", engagementId: ENG, tenantId: "t1", status: "sent" });
  m.markInvoicePaid.mockResolvedValue({ id: "inv-1", engagementId: ENG, status: "paid" });
  m.inngestSend.mockResolvedValue(undefined);
});

describe("Story 5.1 — createInvoiceAction", () => {
  it("happy path: creates the invoice + revalidates the documents path", async () => {
    const res = await createInvoiceAction(validInput());
    expect(res).toEqual({ ok: true, id: "inv-1" });
    expect(m.createInvoice).toHaveBeenCalledWith(
      m.ctx,
      expect.objectContaining({ engagementId: ENG, currency: "PHP" }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith(`/app/engagements/${ENG}/documents`);
  });

  it("LOAD-BEARING GUARD: a non-owned engagement (getEngagement → null) → {ok:false}, no insert", async () => {
    m.getEngagement.mockResolvedValue(null);
    const res = await createInvoiceAction(validInput());
    expect(res.ok).toBe(false);
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects empty line items before any repo call", async () => {
    const res = await createInvoiceAction({ ...validInput(), lineItems: [] });
    expect(res.ok).toBe(false);
    expect(m.getEngagement).not.toHaveBeenCalled();
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a non-3-letter currency", async () => {
    const res = await createInvoiceAction({ ...validInput(), currency: "PESOS" });
    expect(res.ok).toBe(false);
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a length-3 but non-letter currency (would crash Intl at render)", async () => {
    const res = await createInvoiceAction({ ...validInput(), currency: "P!P" });
    expect(res.ok).toBe(false);
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects an invoice total that would overflow int4 (clear message, no insert)", async () => {
    const res = await createInvoiceAction({
      ...validInput(),
      lineItems: [{ description: "Huge", quantity: 1000, unitAmount: 2_000_000_000 }],
    });
    expect(res.ok).toBe(false);
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a float unitAmount (must be integer minor units)", async () => {
    const res = await createInvoiceAction({
      ...validInput(),
      lineItems: [{ description: "x", quantity: 1, unitAmount: 50.5 }],
    });
    expect(res.ok).toBe(false);
    expect(m.createInvoice).not.toHaveBeenCalled();
  });

  it("a repo throw → {ok:false}", async () => {
    m.createInvoice.mockRejectedValue(new Error("db down"));
    const res = await createInvoiceAction(validInput());
    expect(res.ok).toBe(false);
  });
});

describe("Story 5.2 — sendInvoiceAction", () => {
  const sendInput = () => ({ invoiceId: INV_ID, engagementId: ENG });

  it("happy path: draft → sent, emits invoice.sent (with the real ids), revalidates", async () => {
    const res = await sendInvoiceAction(sendInput());
    expect(res).toEqual({ ok: true });
    expect(m.markInvoiceSent).toHaveBeenCalledWith(m.ctx, INV_ID);
    expect(m.inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "invoice.sent",
        data: expect.objectContaining({ invoiceId: "inv-1", engagementId: ENG, tenantId: "t1" }),
      }),
    );
    expect(m.revalidatePath).toHaveBeenCalledWith(`/app/engagements/${ENG}/documents`);
  });

  it("LOAD-BEARING GUARD: getInvoice null → {ok:false}, no transition/emit", async () => {
    m.getInvoice.mockResolvedValue(null);
    const res = await sendInvoiceAction(sendInput());
    expect(res.ok).toBe(false);
    expect(m.markInvoiceSent).not.toHaveBeenCalled();
    expect(m.inngestSend).not.toHaveBeenCalled();
  });

  it("LOAD-BEARING GUARD: an engagementId mismatch (URL tamper) → {ok:false}, no transition", async () => {
    m.getInvoice.mockResolvedValue({ id: "inv-1", engagementId: "99999999-9999-4999-8999-999999999999", status: "draft" });
    const res = await sendInvoiceAction(sendInput());
    expect(res.ok).toBe(false);
    expect(m.markInvoiceSent).not.toHaveBeenCalled();
  });

  it("a non-draft invoice → {ok:false}, no transition/emit", async () => {
    m.getInvoice.mockResolvedValue({ id: "inv-1", engagementId: ENG, status: "sent" });
    const res = await sendInvoiceAction(sendInput());
    expect(res.ok).toBe(false);
    expect(m.markInvoiceSent).not.toHaveBeenCalled();
    expect(m.inngestSend).not.toHaveBeenCalled();
  });

  it("a lost race (markInvoiceSent → null) → {ok:false}, NO emit", async () => {
    m.markInvoiceSent.mockResolvedValue(null);
    const res = await sendInvoiceAction(sendInput());
    expect(res.ok).toBe(false);
    expect(m.inngestSend).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid invoiceId before any repo call", async () => {
    const res = await sendInvoiceAction({ invoiceId: "nope", engagementId: ENG });
    expect(res.ok).toBe(false);
    expect(m.getInvoice).not.toHaveBeenCalled();
  });
});

describe("Story 5.2 — markInvoicePaidAction", () => {
  const paidInput = () => ({ invoiceId: INV_ID, engagementId: ENG });

  it("happy path: sent → paid, revalidates, fires NO event (Paid is out-of-band)", async () => {
    m.getInvoice.mockResolvedValue({ id: "inv-1", engagementId: ENG, status: "sent" });
    const res = await markInvoicePaidAction(paidInput());
    expect(res).toEqual({ ok: true });
    expect(m.markInvoicePaid).toHaveBeenCalledWith(m.ctx, INV_ID);
    expect(m.inngestSend).not.toHaveBeenCalled();
    expect(m.revalidatePath).toHaveBeenCalledWith(`/app/engagements/${ENG}/documents`);
  });

  it("a Draft can NOT be marked paid via the action (must be Sent first) → {ok:false}, no transition", async () => {
    m.getInvoice.mockResolvedValue({ id: "inv-1", engagementId: ENG, status: "draft" });
    const res = await markInvoicePaidAction(paidInput());
    expect(res.ok).toBe(false);
    expect(m.markInvoicePaid).not.toHaveBeenCalled();
  });

  it("GUARD: getInvoice null → {ok:false}, no transition", async () => {
    m.getInvoice.mockResolvedValue(null);
    const res = await markInvoicePaidAction(paidInput());
    expect(res.ok).toBe(false);
    expect(m.markInvoicePaid).not.toHaveBeenCalled();
  });
});
