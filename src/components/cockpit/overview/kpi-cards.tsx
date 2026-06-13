import { Briefcase, ClipboardCheck, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { pickDominantCurrency, type CurrencyTotal } from "@/server/cockpit/overview-summary";
import { formatMoney } from "@/server/doc-engine/money";

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}

export function KpiCards({
  activeEngagements,
  awaitingCuration,
  unreadMessages,
  paidThisMonth,
}: {
  activeEngagements: number;
  awaitingCuration: number;
  unreadMessages: number;
  paidThisMonth: CurrencyTotal[];
}) {
  const paid = pickDominantCurrency(paidThisMonth);
  const paidValue = paid ? formatMoney(paid.minor, paid.currency) : "—";
  const otherCount = paidThisMonth.length - 1;
  const paidHint =
    otherCount > 0 ? `+ ${otherCount} other ${otherCount === 1 ? "currency" : "currencies"}` : "by issue date";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={Briefcase} label="Active engagements" value={String(activeEngagements)} />
      <Kpi
        icon={ClipboardCheck}
        label="Awaiting curation"
        value={String(awaitingCuration)}
        hint={awaitingCuration > 0 ? "candidates to review" : "all caught up"}
      />
      <Kpi icon={MessageSquare} label="Unread messages" value={String(unreadMessages)} />
      <Kpi icon={Wallet} label="Paid this month" value={paidValue} hint={paidHint} />
    </div>
  );
}
