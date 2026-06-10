import { getDownloadUrl, put } from "@vercel/blob";
import { env } from "@/env";
import type { TenantContext } from "@/server/db/context";
import { setInvoicePdfUrl, type Invoice } from "@/server/db/repositories/invoices.repository";
import { renderInvoicePdf } from "./invoice-pdf";

/** The Tenant "from" brand for the PDF (resolved by the route from getTenant/getBranding). */
export type InvoicePdfBrand = {
  clientName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
};

const LOGO_FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch the Tenant logo to an inline data-URL with a hard timeout (Story 5.3 review hardening). We
 * pre-fetch ourselves rather than letting `@react-pdf/renderer`'s `<Image>` do the network I/O: react-pdf's
 * image fetch has NO timeout (a slow/unreachable logo host would hang the function until the platform
 * kills it) and a non-2xx/broken response makes its decoder throw (failing the WHOLE PDF). By fetching
 * here with `AbortSignal.timeout` and returning `null` on ANY failure, a flaky logo degrades to the
 * tenant-name text fallback instead of hanging or 503-ing the download. A valid logo becomes a
 * well-formed data-URL (no hang — react-pdf decodes it synchronously, no network).
 */
async function fetchLogoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return null; // a CDN error page is not an image
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null; // timeout, network error, deleted blob → fall back to the tenant-name text
  }
}

/**
 * Lazy generate-once-and-cache the branded Invoice PDF (Story 5.3), returning a FORCED-DOWNLOAD url.
 * - If the invoice already has a stored blob (`pdf_blob_url`) → return `getDownloadUrl(stored)` (a
 *   pure URL transform, no re-render, no network).
 * - Else render the PDF, store it in Vercel Blob (`access:"public"` — an unguessable random-suffixed
 *   url, the same model as Tenant logos; the route is the authz gate to OBTAIN it), persist the
 *   canonical `url` to `pdf_blob_url`, and return the put result's `downloadUrl`.
 * Throws if Blob isn't configured (the caller maps it to a friendly 503), like the logo upload.
 */
export async function ensureInvoicePdfDownloadUrl(
  ctx: TenantContext,
  invoice: Invoice,
  brand: InvoicePdfBrand,
): Promise<string> {
  if (invoice.pdfBlobUrl) return getDownloadUrl(invoice.pdfBlobUrl);

  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to generate the invoice PDF.");
  }

  // Pre-fetch the logo to an inline data-URL (bounded timeout, graceful fallback) — never let
  // react-pdf do an unbounded network fetch that could hang or 503 the whole document.
  const logoUrl = brand.logoUrl ? await fetchLogoDataUrl(brand.logoUrl) : null;
  const buffer = await renderInvoicePdf({ invoice, ...brand, logoUrl });
  const { url, downloadUrl } = await put(
    `tenants/${invoice.tenantId}/invoices/invoice-${invoice.number}-${invoice.id}.pdf`,
    buffer,
    {
      access: "public",
      token: env.BLOB_READ_WRITE_TOKEN,
      contentType: "application/pdf",
      // The path is deterministic (generate-once per invoice). `allowOverwrite` makes regeneration
      // IDEMPOTENT: without it, @vercel/blob throws "blob already exists" on a concurrent
      // first-download OR if a prior put succeeded but `setInvoicePdfUrl` didn't persist — wedging
      // the invoice into a permanent 503 the lazy cache can never self-heal.
      allowOverwrite: true,
    },
  );
  await setInvoicePdfUrl(ctx, invoice.id, url);
  return downloadUrl;
}
