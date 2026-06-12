import Link from "next/link";
import { FocusHeading } from "@/components/ui/focus-heading";
import { InvoiceStatusChip } from "@/components/invoice/invoice-document";
import { requireOnboardedClient } from "@/server/auth/session";
import { listClientInvoices } from "@/server/db/repositories/invoices.repository";
import { formatMoney } from "@/server/doc-engine/money";
import { PortalEmpty } from "../../portal-empty";
import { PortalInvoiceRealtime } from "../portal-invoice-realtime";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (stable in RSC, locale-agnostic)
}

// Client Documents (Story 5.2) — the invoices the freelancer has SENT (a draft never appears; the
// repository read is status-bounded to sent/paid). Each row links to the in-portal premium document
// view. The Client can't create documents, so there's no CTA. Onboarding-gated like every portal
// surface; ≥44px rows + focus rings (the UX-DR15 floor).
export default async function DocumentsPage() {
  const session = await requireOnboardedClient();
  const invoices = await listClientInvoices(session, session.engagementId);

  if (invoices.length === 0) {
    return (
      <>
        {/* Live: when the freelancer sends the first invoice, this empty state becomes the list. */}
        <PortalInvoiceRealtime engagementId={session.engagementId} />
        <PortalEmpty title="No documents yet" body="Invoices your freelancer sends will appear here." />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PortalInvoiceRealtime engagementId={session.engagementId} />
      <FocusHeading className="font-display text-2xl">Documents</FocusHeading>
      <ul className="flex flex-col gap-2">
        {invoices.map((inv) => (
          <li key={inv.id}>
            <Link
              href={`/portal/documents/${inv.id}`}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 transition-colors hover:bg-muted/40 ${FOCUS_RING}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">#{inv.number}</span>
                <InvoiceStatusChip status={inv.status} />
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-muted-foreground">{fmtDate(inv.issuedAt)}</span>
                <span className="font-mono text-sm font-medium">{formatMoney(inv.amountTotal, inv.currency)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
