import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRelativeTime } from "@/lib/relative-time";
import { isUuid } from "@/lib/uuid";
import { requireFreelancer } from "@/server/auth/session";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { getInvoice } from "@/server/db/repositories/invoices.repository";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { InvoiceDownloadLink } from "@/components/invoice/invoice-download-link";
import { InvoiceActions } from "../invoice-actions";

/** A single Invoice — the premium read-only document view (Story 5.1) + the Freelancer status
 * actions (Story 5.2) + the branded-PDF Download (Story 5.3, for a Sent/Paid invoice). Self-guards
 * (the `[invoiceId]` route is nested under the `(detail)` layout, but defensively re-resolves). The
 * invoice must belong to this Engagement (URL-tamper defense atop RLS). */
export default async function InvoiceViewPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  if (!isUuid(id) || !isUuid(invoiceId)) notFound();
  const ctx = await requireFreelancer();

  const [invoice, engagement, tenant, branding] = await Promise.all([
    getInvoice(ctx, invoiceId),
    getEngagement(ctx, id),
    getTenant(ctx),
    getBranding(ctx),
  ]);
  if (!invoice || !engagement || invoice.engagementId !== id) notFound(); // RLS-null / mismatch → 404

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/app/engagements/${id}/documents`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Invoices
        </Link>
        <div className="flex items-center gap-3">
          {/* "Seen by client": once Sent, whether the client has opened it (live via CockpitRealtime). */}
          {invoice.status !== "draft" ? (
            invoice.clientViewedAt ? (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                ✓ Seen {formatRelativeTime(invoice.clientViewedAt)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sent · not viewed yet</span>
            )
          ) : null}
          {/* A branded PDF is exportable once the invoice is Sent/Paid (a Draft has none). */}
          {invoice.status !== "draft" ? <InvoiceDownloadLink invoiceId={invoice.id} /> : null}
        </div>
      </div>
      <InvoiceDocument
        invoice={invoice}
        clientName={engagement.clientDisplayName}
        tenantName={tenant?.name ?? "Your studio"}
        logoUrl={branding?.logoBlobUrl ?? null}
        accentHex={branding?.accentHex ?? "#5b5bd6"}
      />
      <InvoiceActions invoiceId={invoice.id} engagementId={id} status={invoice.status} />
    </div>
  );
}
