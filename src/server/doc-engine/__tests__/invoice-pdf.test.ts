import { describe, expect, it } from "vitest";
import type { Invoice } from "@/server/db/repositories/invoices.repository";
import { renderInvoicePdf, type InvoicePdfData } from "../invoice-pdf";

const baseInvoice: Invoice = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "t1",
  engagementId: "e1",
  number: 7,
  status: "sent",
  lineItems: [
    { description: "Design", quantity: 2, unitAmount: 5000 },
    { description: "Build", quantity: 1.5, unitAmount: 8000 },
  ],
  amountTotal: 2 * 5000 + Math.round(1.5 * 8000),
  currency: "PHP",
  issuedAt: new Date("2026-06-01T00:00:00Z"),
  dueAt: new Date("2026-06-15T00:00:00Z"),
  notes: "Thanks for your business!",
  pdfBlobUrl: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

const data = (over: Partial<InvoicePdfData> = {}): InvoicePdfData => ({
  invoice: baseInvoice,
  clientName: "Acme Co",
  tenantName: "Alpha Studio",
  logoUrl: null, // null → no remote fetch in the test (the tenant-name text fallback renders)
  accentHex: "#5b5bd6",
  ...over,
});

const magic = (buf: Buffer) => buf.subarray(0, 5).toString("latin1");

describe("Story 5.3 — renderInvoicePdf", () => {
  it("renders a valid PDF (the %PDF- magic) for a Sent invoice", async () => {
    const buf = await renderInvoicePdf(data());
    expect(buf).toBeInstanceOf(Buffer);
    expect(magic(buf)).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(800); // a real document, not an empty stub
  });

  it("renders a 0-decimal currency (JPY) without notes or a due date — no throw, valid PDF", async () => {
    const invoice: Invoice = { ...baseInvoice, currency: "JPY", notes: null, dueAt: null, amountTotal: 12000 };
    const buf = await renderInvoicePdf(data({ invoice }));
    expect(magic(buf)).toBe("%PDF-");
  });

  // NOTE: the `logoUrl` <Image> branch is exercised live (Task 5) with a real Tenant Blob logo, NOT
  // unit-tested — react-pdf fetches+decodes the src at render time, so a unit test would need either
  // a network fetch or a bundled image, and a malformed image makes react-pdf's decoder hang
  // (pathological). The null-logo path (the tenant-name text fallback) is the tested branch.
});
