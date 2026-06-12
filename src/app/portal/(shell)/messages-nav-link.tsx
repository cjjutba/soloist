"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useRealtimeInvalidate } from "@/components/realtime/realtime-provider";
import { engagementChannel } from "@/lib/realtime-channels";
import type { ChatPayload } from "@/components/chat/chat";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The portal "Messages" nav item with a live unread badge (realtime slice 3). Shares the
 * `["chat", engagementId]` query with the thread (one poll; the thread's mark-read invalidates it),
 * and subscribes to the `message` signal so the badge updates instantly shell-wide — even while the
 * client is on another portal page. Badge is Soloist Iris, absent at zero; the count rides the
 * accessible name (the badge is decorative).
 */
export function MessagesNavLink({ engagementId }: { engagementId: string }) {
  const pathname = usePathname();
  const active = pathname === "/portal/messages";

  const { data } = useQuery({
    queryKey: ["chat", engagementId],
    queryFn: async (): Promise<ChatPayload> => {
      const res = await fetch(`/api/chat/${engagementId}`);
      if (!res.ok) throw new Error(`chat ${res.status}`);
      return (await res.json()) as ChatPayload;
    },
    refetchInterval: 60_000,
  });
  useRealtimeInvalidate(engagementChannel(engagementId), "message", ["chat", engagementId]);

  const count = data?.unreadCount ?? 0;

  return (
    <Link
      href="/portal/messages"
      aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? `Messages, ${count} unread` : "Messages"}
      className={cn(
        "relative flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm transition-colors",
        FOCUS_RING,
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      Messages
      {count > 0 ? (
        <span
          aria-hidden
          className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#5b5bd6] px-1 font-mono text-[10px] font-medium leading-4 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
