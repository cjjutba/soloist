import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusHeading } from "@/components/ui/focus-heading";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { InvoiceDownloadLink } from "@/components/invoice/invoice-download-link";
import { isUuid } from "@/lib/uuid";
import { requireOnboardedClient } from "@/server/auth/session";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { getClientInvoice } from "@/server/db/repositories/invoices.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { PortalInvoiceRealtime } from "../../portal-invoice-realtime";
import { MarkInvoiceSeen } from "./mark-invoice-seen";

/**
 * A single Invoice — the Client's in-portal premium document view (Story 5.2). Reuses the SAME
 * `InvoiceDocument` as the Cockpit (and 5.3's PDF mirrors it). `getClientInvoice` returns null for a
 * Draft (never leaks to the Client), an invoice outside their engagement (RLS), or a bad id → 404.
 * The Tenant brand is the "from" (a Client reads their own Tenant's brand, like the portal shell). A
 * sr-only FocusHeading moves focus on route change (the UX-DR15 a11y floor). 5.3 adds Download here.
 */
export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  if (!isUuid(invoiceId)) notFound();
  const session = await requireOnboardedClient();

  const [invoice, engagement, tenant, branding] = await Promise.all([
    getClientInvoice(session, invoiceId),
    getEngagement(session, session.engagementId),
    getTenant(session),
    getBranding(session),
  ]);
  if (!invoice) notFound(); // RLS-null / draft / cross-engagement → 404

  return (
    <div className="flex flex-col gap-4">
      {/* Live: the status chip flips to Paid (or any change) without a reload. */}
      <PortalInvoiceRealtime engagementId={session.engagementId} />
      <MarkInvoiceSeen invoiceId={invoice.id} />
      <FocusHeading className="sr-only">Invoice</FocusHeading>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/portal/documents"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Documents
        </Link>
        {/* The Client only ever sees Sent/Paid here (getClientInvoice excludes drafts), so always offer it. */}
        <InvoiceDownloadLink invoiceId={invoice.id} />
      </div>
      <InvoiceDocument
        invoice={invoice}
        clientName={engagement?.clientDisplayName ?? session.name}
        tenantName={tenant?.name ?? "Your freelancer"}
        logoUrl={branding?.logoBlobUrl ?? null}
        accentHex={branding?.accentHex ?? "#5b5bd6"}
      />
    </div>
  );
}
