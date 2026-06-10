import { Download } from "lucide-react";

/**
 * A "Download PDF" link for a Sent/Paid invoice (Story 5.3) — a plain anchor to the authz'd Route
 * Handler (`GET /api/invoices/[id]/pdf`), which 307-redirects to the branded PDF's forced-download
 * Blob url. No client JS needed. ≥44px hit area + a focus ring (the UX-DR15 floor). Shared by the
 * Client portal view and the Cockpit view; only rendered for a Sent/Paid invoice (a Draft has none).
 */
export function InvoiceDownloadLink({ invoiceId }: { invoiceId: string }) {
  return (
    <a
      href={`/api/invoices/${invoiceId}/pdf`}
      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Download className="size-4" aria-hidden />
      Download PDF
    </a>
  );
}
