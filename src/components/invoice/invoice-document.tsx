import { cn } from "@/lib/utils";
import { computeLineTotal, formatMoney } from "@/server/doc-engine/money";
import type { InvoiceLineItem } from "@/server/doc-engine/invoice.schema";
import type { Invoice } from "@/server/db/repositories/invoices.repository";

/** Draft / Sent / Paid chip. Calm, status-coded — used by the list AND the document view. */
export function InvoiceStatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-[#5b5bd6]/10 text-[#5b5bd6]",
    paid: "bg-emerald-500/10 text-emerald-700",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function fmtDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD (stable, locale-agnostic)
}

export type InvoiceDocumentProps = {
  invoice: Invoice;
  clientName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
};

/**
 * The premium read-only Invoice document (Story 5.1) — serif title, generous spacing, Tenant brand
 * as the "from", `numeric` (tabular) amounts. NOT a form printout (DESIGN.md L181). Standalone so
 * Story 5.2 reuses it for the Client portal view and 5.3's PDF mirrors it. Amounts are integer minor
 * units formatted via `Intl.NumberFormat`.
 */
export function InvoiceDocument({ invoice, clientName, tenantName, logoUrl, accentHex }: InvoiceDocumentProps) {
  const lineItems = (invoice.lineItems as InvoiceLineItem[]) ?? [];
  return (
    <article
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
      style={{ borderTop: `3px solid ${accentHex}` }}
    >
      <div className="flex flex-col gap-8 p-8">
        {/* Header: from + the invoice number/status. */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Tenant logo from Blob
              <img src={logoUrl} alt={tenantName} className="h-8 w-auto max-w-[160px] object-contain" />
            ) : (
              <span className="font-display text-xl">{tenantName}</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <h1 className="font-display text-2xl">Invoice #{invoice.number}</h1>
            <InvoiceStatusChip status={invoice.status} />
          </div>
        </header>

        {/* Bill-to + dates. */}
        <div className="flex flex-wrap justify-between gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</span>
            <span className="font-medium">{clientName}</span>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <span className="font-mono text-xs text-muted-foreground">Issued {fmtDate(invoice.issuedAt)}</span>
            {invoice.dueAt ? (
              <span className="font-mono text-xs text-muted-foreground">Due {fmtDate(invoice.dueAt)}</span>
            ) : null}
          </div>
        </div>

        {/* Line items. */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Unit</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right font-mono">{item.quantity}</td>
                <td className="py-2 text-right font-mono">{formatMoney(item.unitAmount, invoice.currency)}</td>
                <td className="py-2 text-right font-mono">{formatMoney(computeLineTotal(item), invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-sm text-muted-foreground">
                Total
              </td>
              <td className="pt-3 text-right font-mono text-lg font-semibold">
                {formatMoney(invoice.amountTotal, invoice.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.notes ? (
          <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Notes</span>
            <p className="whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
