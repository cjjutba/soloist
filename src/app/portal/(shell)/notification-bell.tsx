"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { unreadCount, type NotificationRow } from "./notifications";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The portal nav bell (Story 4.1) — a Link to the center with a polled unread badge. Shares the
 * `["notifications"]` query with the center (one poll; mark-read invalidates it). The badge is
 * Soloist Iris, **absent at zero**; the count lives in the Link's accessible name (the badge is
 * decorative). ≥44px hit area + focus ring preserved from the 2.6 bell.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const active = pathname === "/portal/notifications";

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      const json = (await res.json()) as { notifications: NotificationRow[] };
      return json.notifications;
    },
    // Realtime (the user channel "notification" signal) makes the bell instant; the poll is now a
    // slow fallback for when Ably can't connect.
    refetchInterval: 60_000,
  });
  const count = data ? unreadCount(data) : 0;

  return (
    <Link
      href="/portal/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] transition-colors",
        FOCUS_RING,
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#5b5bd6] px-1 font-mono text-[10px] font-medium leading-4 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
