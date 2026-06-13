import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CandidateBadge, StatusBadge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/relative-time";
import { requireFreelancer } from "@/server/auth/session";
import { getCockpitDashboard } from "@/server/cockpit/data";
import { ArchiveButton } from "./archive-button";

export default async function EngagementsPage() {
  const session = await requireFreelancer();
  const engagements = await getCockpitDashboard(session);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Engagements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each engagement is one client&apos;s branded workspace.
          </p>
        </div>
        <Link href="/app/engagements/new" className={buttonVariants()}>
          New engagement
        </Link>
      </header>

      {engagements.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <p className="text-muted-foreground">No engagements yet — create your first.</p>
          <Link href="/app/engagements/new" className={buttonVariants({ variant: "outline" })}>
            New engagement
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {engagements.map((e) => (
            <li key={e.id}>
              <Card className="flex items-center justify-between gap-4 p-4">
                <Link
                  href={`/app/engagements/${e.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1 rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{e.name}</span>
                    <StatusBadge status={e.status} />
                    <CandidateBadge count={e.candidateCount} />
                    {e.chatUnreadCount > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-1.5 font-mono text-[10px] font-medium leading-4 text-primary-foreground"
                        aria-label={`${e.chatUnreadCount} unread message${e.chatUnreadCount === 1 ? "" : "s"}`}
                      >
                        <MessageCircle className="size-2.5" aria-hidden />
                        {e.chatUnreadCount > 99 ? "99+" : e.chatUnreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate">{e.clientDisplayName}</span>
                    <span aria-hidden>·</span>
                    <time
                      dateTime={e.lastActivityAt.toISOString()}
                      title={e.lastActivityAt.toISOString()}
                      className="shrink-0 font-mono text-xs"
                    >
                      {formatRelativeTime(e.lastActivityAt)}
                    </time>
                  </span>
                  {e.lastSeenAt ? (
                    <span className="text-xs text-emerald-700">
                      Client viewed {formatRelativeTime(e.lastSeenAt)}
                    </span>
                  ) : null}
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/engagements/${e.id}/edit`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Edit
                  </Link>
                  <ArchiveButton id={e.id} name={e.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
