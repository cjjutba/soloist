"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FocusHeading } from "@/components/ui/focus-heading";
import { ShipStatusTag } from "@/components/ui/ship-status-tag";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/server/portal/notifications.actions";
import { notificationPresentation, unreadCount, type NotificationRow } from "./notifications";

/**
 * The Client notification center (Story 4.1). RSC seeds `initialRows`; this island polls the shared
 * `["notifications"]` query (dedups with the bell). Each row links to the Ship Feed and marks itself
 * read on click; a "Mark all as read" clears the rest. Mark-read invalidates `["notifications"]` so
 * the bell badge + the list both refresh. A stable sr-only h1 (route-nav focus; no focus-steal on poll).
 */
export function NotificationCenter({ initialRows }: { initialRows: NotificationRow[] }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      const json = (await res.json()) as { notifications: NotificationRow[] };
      return json.notifications;
    },
    initialData: initialRows,
    // Realtime makes new notifications instant; the poll is now a slow fallback.
    refetchInterval: 60_000,
  });
  const rows = data;
  const unread = unreadCount(rows);

  // Optimistically stamp read so the bell badge + list drop instantly (the persistent bell shares
  // this cache), then reconcile with the server via invalidate. On failure the invalidate refetches
  // the truth, reverting the optimism.
  function optimisticRead(match: (n: NotificationRow) => boolean) {
    const now = new Date().toISOString();
    queryClient.setQueryData<NotificationRow[]>(["notifications"], (old) =>
      old?.map((n) => (match(n) && n.readAt == null ? { ...n, readAt: now } : n)),
    );
  }

  async function markRead(ids: string[]) {
    optimisticRead((n) => ids.includes(n.id));
    const res = await markNotificationsReadAction(ids);
    if (!res.ok) toast.error("Couldn't mark as read.");
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function markAll() {
    optimisticRead(() => true);
    const res = await markAllNotificationsReadAction();
    if (!res.ok) toast.error("Couldn't mark all as read.");
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ONE stable sr-only h1 (route-nav focus). The empty hero is bespoke (NOT PortalEmpty, which
          bakes its own FocusHeading) — two FocusHeadings would fight over focus (the 3.7 lesson). */}
      <FocusHeading className="sr-only">Notifications</FocusHeading>

      {rows.length === 0 ? (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
          <p className="font-display text-3xl">You&rsquo;re all caught up</p>
          <p className="max-w-sm text-balance text-muted-foreground">
            New updates will show up here as they land.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "All read"}</p>
            {unread > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => void markAll()}>
                Mark all as read
              </Button>
            ) : null}
          </div>

          <ul className="flex flex-col gap-2">
            {rows.map((n) => {
              const isUnread = n.readAt == null;
              const { href, label } = notificationPresentation(n);
              return (
                <li key={n.id}>
                  <Link
                    href={href}
                    onClick={() => {
                      if (isUnread) void markRead([n.id]);
                    }}
                    className={cn(
                      "block rounded-[var(--radius-lg)] border border-border p-4 transition-colors hover:bg-muted/40",
                      isUnread ? "bg-muted/30" : "bg-card",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isUnread ? <span className="size-2 shrink-0 rounded-full bg-[#5b5bd6]" aria-hidden /> : null}
                      {n.statusTag ? <ShipStatusTag status={n.statusTag} /> : null}
                      <time
                        dateTime={n.createdAt}
                        suppressHydrationWarning
                        className="ml-auto font-mono text-xs text-muted-foreground"
                      >
                        {formatRelativeTime(new Date(n.createdAt))}
                      </time>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {label}
                      {isUnread ? <span className="sr-only"> (unread)</span> : null}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
