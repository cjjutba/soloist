import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/server/db/repositories/invoices.repository";
import type { InvoicePdfBrand } from "../invoice-pdf-storage";

const m = vi.hoisted(() => ({
  env: { BLOB_READ_WRITE_TOKEN: "blob-token" as string | undefined },
  put: vi.fn(),
  getDownloadUrl: vi.fn(),
  renderInvoicePdf: vi.fn(),
  setInvoicePdfUrl: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: m.put, getDownloadUrl: m.getDownloadUrl }));
vi.mock("@/env", () => ({ env: m.env }));
vi.mock("../invoice-pdf", () => ({ renderInvoicePdf: m.renderInvoicePdf }));
vi.mock("@/server/db/repositories/invoices.repository", () => ({ setInvoicePdfUrl: m.setInvoicePdfUrl }));
vi.stubGlobal("fetch", m.fetch);

import { ensureInvoicePdfDownloadUrl } from "../invoice-pdf-storage";

const ctx = { tenantId: "t1", userId: "owner", role: "freelancer" as const };
const invoice = { id: "inv-1", tenantId: "t1", number: 7, status: "sent", pdfBlobUrl: null } as unknown as Invoice;
const brand: InvoicePdfBrand = { clientName: "Acme", tenantName: "Alpha", logoUrl: null, accentHex: "#5b5bd6" };

beforeEach(() => {
  vi.clearAllMocks();
  m.env.BLOB_READ_WRITE_TOKEN = "blob-token";
  m.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF-fake"));
  m.put.mockResolvedValue({ url: "https://blob/inv.pdf", downloadUrl: "https://blob/inv.pdf?download=1" });
  m.getDownloadUrl.mockReturnValue("https://blob/stored.pdf?download=1");
  m.setInvoicePdfUrl.mockResolvedValue(undefined);
  m.fetch.mockResolvedValue({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, // PNG magic
  });
});

describe("Story 5.3 — ensureInvoicePdfDownloadUrl", () => {
  it("no stored pdf → renders + puts (application/pdf, tenant-scoped path, allowOverwrite) + persists + returns downloadUrl", async () => {
    const url = await ensureInvoicePdfDownloadUrl(ctx, invoice, brand);
    expect(url).toBe("https://blob/inv.pdf?download=1");
    expect(m.renderInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ invoice, clientName: "Acme", accentHex: "#5b5bd6" }));
    expect(m.put).toHaveBeenCalledWith(
      "tenants/t1/invoices/invoice-7-inv-1.pdf",
      expect.anything(),
      // allowOverwrite makes regeneration idempotent (no "blob already exists" 503 on a race/persist-fail).
      expect.objectContaining({ access: "public", contentType: "application/pdf", token: "blob-token", allowOverwrite: true }),
    );
    expect(m.setInvoicePdfUrl).toHaveBeenCalledWith(ctx, "inv-1", "https://blob/inv.pdf"); // the canonical url, not the download one
    expect(m.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("a Tenant logo → pre-fetched to an inline data-URL (no react-pdf network fetch)", async () => {
    await ensureInvoicePdfDownloadUrl(ctx, invoice, { ...brand, logoUrl: "https://blob/logo.png" });
    expect(m.fetch).toHaveBeenCalledWith("https://blob/logo.png", expect.objectContaining({ signal: expect.anything() }));
    expect(m.renderInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: expect.stringMatching(/^data:image\/png;base64,/) }),
    );
  });

  it("a broken/slow logo (fetch !ok or throws) → renders with logoUrl null (graceful text fallback, no hang/503)", async () => {
    m.fetch.mockResolvedValueOnce({ ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
    await ensureInvoicePdfDownloadUrl(ctx, invoice, { ...brand, logoUrl: "https://blob/dead.png" });
    expect(m.renderInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: null }));

    m.fetch.mockRejectedValueOnce(new Error("timeout"));
    await ensureInvoicePdfDownloadUrl(ctx, invoice, { ...brand, logoUrl: "https://blob/slow.png" });
    expect(m.renderInvoicePdf).toHaveBeenLastCalledWith(expect.objectContaining({ logoUrl: null }));
  });

  it("already stored → returns getDownloadUrl(stored), NO re-render / NO re-put", async () => {
    const stored = { ...invoice, pdfBlobUrl: "https://blob/stored.pdf" } as Invoice;
    const url = await ensureInvoicePdfDownloadUrl(ctx, stored, brand);
    expect(url).toBe("https://blob/stored.pdf?download=1");
    expect(m.getDownloadUrl).toHaveBeenCalledWith("https://blob/stored.pdf");
    expect(m.renderInvoicePdf).not.toHaveBeenCalled();
    expect(m.put).not.toHaveBeenCalled();
    expect(m.setInvoicePdfUrl).not.toHaveBeenCalled();
  });

  it("no Blob token → throws before rendering (the caller maps to 503)", async () => {
    m.env.BLOB_READ_WRITE_TOKEN = undefined;
    await expect(ensureInvoicePdfDownloadUrl(ctx, invoice, brand)).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/);
    expect(m.renderInvoicePdf).not.toHaveBeenCalled();
    expect(m.put).not.toHaveBeenCalled();
  });
});
