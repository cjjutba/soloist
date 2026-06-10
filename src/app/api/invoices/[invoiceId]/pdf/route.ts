import * as Sentry from "@sentry/nextjs";
import { isUuid } from "@/lib/uuid";
import { getAppSession } from "@/server/auth/session";
import type { TenantContext } from "@/server/db/context";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { getClientInvoice, getInvoice, type Invoice } from "@/server/db/repositories/invoices.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { ensureInvoicePdfDownloadUrl } from "@/server/doc-engine/invoice-pdf-storage";

// Renders a PDF + writes to the Neon/Drizzle pool + Vercel Blob (Node-only). Pin the runtime.
export const runtime = "nodejs";

/**
 * The branded-Invoice-PDF download (Story 5.3) — the IO boundary (AR-14: a Route Handler, not a
 * Server Action, because it returns/redirects a binary). Deny-by-default authz like
 * `GET /api/feed/[engagementId]`: `getAppSession` (handlers can't redirect) → 401 / 403; the invoice
 * is read RLS-scoped by role (a Freelancer sees their Tenant's, a Client only their engagement's,
 * draft-excluded); a Draft / cross-scope / bad id → neutral 404. On success it lazily generates +
 * caches the PDF in Vercel Blob and 307-redirects to the forced-download url.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  const { invoiceId } = await params;
  if (!isUuid(invoiceId)) return new Response("Not found", { status: 404 });

  const session = await getAppSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!session.tenantId) return new Response("Forbidden", { status: 403 });

  // Resolve the invoice + ctx by role (RLS-scoped reads).
  let ctx: TenantContext;
  let invoice: Invoice | null;
  if (session.role === "freelancer") {
    ctx = { tenantId: session.tenantId, userId: session.userId, role: "freelancer" };
    invoice = await getInvoice(ctx, invoiceId);
  } else if (session.role === "client" && session.engagementId) {
    ctx = { tenantId: session.tenantId, userId: session.userId, role: "client", engagementId: session.engagementId };
    invoice = await getClientInvoice(ctx, invoiceId); // draft-excluding
    if (invoice && invoice.engagementId !== session.engagementId) invoice = null; // defense-in-depth atop RLS
  } else {
    return new Response("Forbidden", { status: 403 });
  }

  // A Draft is never exportable (getClientInvoice already excludes it; guard the freelancer read too).
  if (!invoice || invoice.status === "draft") return new Response("Not found", { status: 404 });

  try {
    const [tenant, branding, engagement] = await Promise.all([
      getTenant(ctx),
      getBranding(ctx),
      getEngagement(ctx, invoice.engagementId),
    ]);
    const downloadUrl = await ensureInvoicePdfDownloadUrl(ctx, invoice, {
      clientName: engagement?.clientDisplayName ?? "Client",
      tenantName: tenant?.name ?? "Your studio",
      logoUrl: branding?.logoBlobUrl ?? null,
      accentHex: branding?.accentHex ?? "#5b5bd6",
    });
    // 307 to the Blob CDN (which serves the attachment). `private, no-store` so an intermediary
    // never caches the redirect to this per-invoice download (mirrors the /api/feed handler).
    return new Response(null, {
      status: 307,
      headers: { Location: downloadUrl, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[invoice-pdf] generation failed:", err instanceof Error ? err.message : String(err));
    Sentry.captureException(err);
    return new Response("Could not generate the invoice PDF.", { status: 503 });
  }
}
