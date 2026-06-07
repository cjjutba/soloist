import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "owner", role: "freelancer" as const },
  getEngagement: vi.fn(),
  createInvoice: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireFreelancer: () => Promise.resolve(m.ctx) }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/db/repositories/invoices.repository", () => ({ createInvoice: m.createInvoice }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { createInvoiceAction } from "../invoice.actions";

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
