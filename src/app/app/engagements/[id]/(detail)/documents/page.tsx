import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { isUuid } from "@/lib/uuid";
import { requireFreelancer } from "@/server/auth/session";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import { listInvoices } from "@/server/db/repositories/invoices.repository";
import { formatMoney } from "@/server/doc-engine/money";
import { InvoiceBuilder } from "./invoice-builder";
import { InvoiceStatusChip } from "./invoice-document";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (stable in RSC, locale-agnostic)
}

/** The Documents tab (Story 5.1) — the Cockpit invoice surface. The `(detail)` layout already
 * guards the Engagement; `isUuid` + `getEngagement` here are defensive (page + layout render
 * concurrently) and also supply the prefill (`clientDisplayName`). 5.1 = create + list + view. */
export default async function DocumentsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireFreelancer();
  const engagement = await getEngagement(ctx, id);
  if (!engagement) notFound();
  const invoices = await listInvoices(ctx, id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Invoices</h2>
        <p className="text-sm text-muted-foreground">
          Bill {engagement.clientDisplayName} — prefilled, so you don&rsquo;t re-type anything.
        </p>
      </div>

      <InvoiceBuilder engagementId={id} clientName={engagement.clientDisplayName} />

      {invoices.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <p className="font-display text-2xl">No invoices yet</p>
          <p className="max-w-sm text-balance text-sm text-muted-foreground">
            Create your first invoice — it&rsquo;ll be numbered automatically and prefilled with{" "}
            {engagement.clientDisplayName}.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/app/engagements/${id}/documents/${inv.id}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-4 transition-colors hover:bg-muted/40"
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
      )}
    </div>
  );
}
