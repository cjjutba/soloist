import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/server/doc-engine/money";

export type OutstandingRow = {
  id: string;
  number: number;
  amountTotal: number;
  currency: string;
  engagementId: string;
  engagementName: string;
};

export function OutstandingInvoices({ rows }: { rows: OutstandingRow[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Outstanding invoices</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sent invoices awaiting payment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3">
              <Link
                href={`/app/engagements/${r.engagementId}/documents/${r.id}`}
                className="flex min-w-0 flex-col"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  #{r.number} · {r.engagementName}
                </span>
              </Link>
              <span className="shrink-0 font-mono text-sm text-foreground">
                {formatMoney(r.amountTotal, r.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
