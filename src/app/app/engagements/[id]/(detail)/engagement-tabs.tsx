"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Route-based tab nav for the Engagement-detail shell (Story 2.2). Each tab is a real
 * route (architecture: separate pages), so this is Links + `usePathname` for the active
 * state — not Radix Tabs. The Ship Feed (curation queue) is the default/index tab. */
export function EngagementTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/app/engagements/${id}`;
  const tabs = [
    { label: "Ship Feed", href: base, exact: true },
    { label: "Repos", href: `${base}/repos`, exact: false },
    { label: "Client", href: `${base}/client`, exact: false },
    { label: "Documents", href: `${base}/documents`, exact: false },
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
            className={cn(
              "flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
