import Link from "next/link";
import { ClipboardCheck, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AttentionCard({
  awaitingCuration,
  unreadMessages,
  outstandingCount,
}: {
  awaitingCuration: number;
  unreadMessages: number;
  outstandingCount: number;
}) {
  const items: { icon: LucideIcon; n: number; label: string; href: string }[] = [
    { icon: ClipboardCheck, n: awaitingCuration, label: awaitingCuration === 1 ? "update to curate" : "updates to curate", href: "/app/engagements" },
    { icon: MessageSquare, n: unreadMessages, label: unreadMessages === 1 ? "unread message" : "unread messages", href: "/app/engagements" },
    { icon: Wallet, n: outstandingCount, label: outstandingCount === 1 ? "invoice outstanding" : "invoices outstanding", href: "/app/engagements" },
  ];
  const active = items.filter((i) => i.n > 0);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Needs your attention</h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">You&apos;re all caught up. 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((i, idx) => (
            <li key={idx}>
              <Link href={i.href} className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
                  <i.icon className="size-4" />
                </span>
                <span>
                  <span className="font-mono font-semibold">{i.n}</span> {i.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
