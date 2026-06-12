"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Route-based tab nav for the Engagement-detail shell (Story 2.2). Each tab is a real
 * route (architecture: separate pages), so this is Links + `usePathname` for the active
 * state — not Radix Tabs. The Ship Feed (curation queue) is the default/index tab. The
 * Messages tab carries a live unread badge (the layout re-fetches `messagesUnread` on the
 * `message`/`seen` realtime signals via CockpitRealtime). */
export function EngagementTabs({ id, messagesUnread = 0 }: { id: string; messagesUnread?: number }) {
  const pathname = usePathname();
  const base = `/app/engagements/${id}`;
  const tabs = [
    { label: "Ship Feed", href: base, exact: true, badge: 0 },
    { label: "Repos", href: `${base}/repos`, exact: false, badge: 0 },
    { label: "Client", href: `${base}/client`, exact: false, badge: 0 },
    { label: "Documents", href: `${base}/documents`, exact: false, badge: 0 },
    { label: "Messages", href: `${base}/messages`, exact: false, badge: messagesUnread },
  ];

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Engagement sections">
      {tabs.map((t) => {
        // Ship Feed (the index) matches exactly; section tabs also match their nested
        // routes (e.g. a future /repos/[repoId]) so the tab stays highlighted.
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            aria-label={t.badge > 0 ? `${t.label}, ${t.badge} unread` : undefined}
            className={cn(
              "flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge > 0 ? (
              <span
                aria-hidden
                className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#5b5bd6] px-1 font-mono text-[10px] font-medium leading-4 text-white"
              >
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
