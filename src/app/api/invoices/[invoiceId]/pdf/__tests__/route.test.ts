import { beforeEach, describe, expect, it, vi } from "vitest";

const ENG = "11111111-1111-4111-8111-111111111111";
const INV = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  getInvoice: vi.fn(),
  getClientInvoice: vi.fn(),
  getTenant: vi.fn(),
  getBranding: vi.fn(),
  getEngagement: vi.fn(),
  ensureInvoicePdfDownloadUrl: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getAppSession: m.getAppSession }));
vi.mock("@/server/db/repositories/invoices.repository", () => ({
  getInvoice: m.getInvoice,
  getClientInvoice: m.getClientInvoice,
}));
vi.mock("@/server/db/repositories/tenants.repository", () => ({ getTenant: m.getTenant }));
vi.mock("@/server/db/repositories/branding.repository", () => ({ getBranding: m.getBranding }));
vi.mock("@/server/db/repositories/engagements.repository", () => ({ getEngagement: m.getEngagement }));
vi.mock("@/server/doc-engine/invoice-pdf-storage", () => ({ ensureInvoicePdfDownloadUrl: m.ensureInvoicePdfDownloadUrl }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "../route";

const freelancer = { userId: "owner", role: "freelancer", tenantId: "t1" };
const client = { userId: "client-1", role: "client", tenantId: "t1", engagementId: ENG };
const req = new Request(`https://soloist.cjjutba.com/api/invoices/${INV}/pdf`);
const params = (invoiceId = INV) => ({ params: Promise.resolve({ invoiceId }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.getInvoice.mockResolvedValue({ id: INV, engagementId: ENG, status: "sent", tenantId: "t1", number: 1, pdfBlobUrl: null });
  m.getClientInvoice.mockResolvedValue({ id: INV, engagementId: ENG, status: "sent", tenantId: "t1", number: 1, pdfBlobUrl: null });
  m.getTenant.mockResolvedValue({ name: "Alpha" });
  m.getBranding.mockResolvedValue({ logoBlobUrl: null, accentHex: "#5b5bd6" });
  m.getEngagement.mockResolvedValue({ clientDisplayName: "Acme" });
  m.ensureInvoicePdfDownloadUrl.mockResolvedValue("https://blob.example/inv.pdf?download=1");
});

describe("Story 5.3 — GET /api/invoices/[invoiceId]/pdf", () => {
  it("a Freelancer (own Tenant, Sent) → 307 redirect to the download url; reads via getInvoice", async () => {
    m.getAppSession.mockResolvedValue(freelancer);
    const res = await GET(req, params());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://blob.example/inv.pdf?download=1");
    expect(res.headers.get("cache-control")).toBe("private, no-store"); // never cache the per-invoice redirect
    expect(m.getInvoice).toHaveBeenCalledWith(expect.objectContaining({ role: "freelancer", tenantId: "t1" }), INV);
    expect(m.getClientInvoice).not.toHaveBeenCalled();
    expect(m.ensureInvoicePdfDownloadUrl).toHaveBeenCalled();
  });

  it("a Client (own engagement, Sent) → 307; reads via getClientInvoice (draft-excluding), NOT getInvoice", async () => {
    m.getAppSession.mockResolvedValue(client);
    const res = await GET(req, params());
    expect(res.status).toBe(307);
    expect(m.getClientInvoice).toHaveBeenCalledWith(expect.objectContaining({ role: "client", engagementId: ENG }), INV);
    expect(m.getInvoice).not.toHaveBeenCalled();
  });

  it("no session → 401, no read/generate", async () => {
    m.getAppSession.mockResolvedValue(null);
    expect((await GET(req, params())).status).toBe(401);
    expect(m.ensureInvoicePdfDownloadUrl).not.toHaveBeenCalled();
  });

  it("a client with no engagement → 403", async () => {
    m.getAppSession.mockResolvedValue({ ...client, engagementId: undefined });
    expect((await GET(req, params())).status).toBe(403);
    expect(m.ensureInvoicePdfDownloadUrl).not.toHaveBeenCalled();
  });

  it("a Draft → 404, no generate (a draft is never exportable)", async () => {
    m.getAppSession.mockResolvedValue(freelancer);
    m.getInvoice.mockResolvedValue({ id: INV, engagementId: ENG, status: "draft", tenantId: "t1", number: 1, pdfBlobUrl: null });
    expect((await GET(req, params())).status).toBe(404);
    expect(m.ensureInvoicePdfDownloadUrl).not.toHaveBeenCalled();
  });

  it("a Client requesting an invoice they can't see → 404 (getClientInvoice null)", async () => {
    m.getAppSession.mockResolvedValue(client);
    m.getClientInvoice.mockResolvedValue(null);
    expect((await GET(req, params())).status).toBe(404);
    expect(m.ensureInvoicePdfDownloadUrl).not.toHaveBeenCalled();
  });

  it("a non-uuid invoiceId → 404 before any session work", async () => {
    const res = await GET(req, params("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(m.getAppSession).not.toHaveBeenCalled();
  });

  it("a generation failure → 503", async () => {
    m.getAppSession.mockResolvedValue(freelancer);
    m.ensureInvoicePdfDownloadUrl.mockRejectedValue(new Error("blob down"));
    expect((await GET(req, params())).status).toBe(503);
  });
});
