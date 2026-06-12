"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  usePresenceEnter,
  usePresenceMembers,
  usePresenceTyping,
  useRealtimeInvalidate,
} from "@/components/realtime/realtime-provider";
import { engagementChannel } from "@/lib/realtime-channels";
import {
  markChatReadAsClientAction,
  markChatReadAsFreelancerAction,
  sendMessageAsClientAction,
  sendMessageAsFreelancerAction,
} from "@/server/chat/chat.actions";
import { cn } from "@/lib/utils";
import { ChatComposer } from "./chat-composer";
import {
  dayLabel,
  groupByDay,
  isMessageRead,
  lastOwnMessageId,
  type ChatPayload,
  type ChatRole,
} from "./chat";

const QUERY_KEY = (id: string) => ["chat", id] as const;

const isTyping = (data: unknown): boolean =>
  typeof data === "object" && data !== null && (data as { typing?: unknown }).typing === true;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * The shared, two-sided chat thread (realtime slice 3) — rendered identically on the freelancer
 * Messages tab and the client portal. RSC seeds `initialData`; this island refetches
 * `GET /api/chat/[engagementId]` INSTANTLY on the `message`/`seen` realtime signals (Ably), 60s
 * poll fallback. Presence drives the other party's online/typing line; the read cursors drive the
 * "Read" receipt. Opening the thread (with unread) advances the caller's read cursor.
 */
export function ChatThread({
  engagementId,
  role,
  selfUserId,
  otherLabel,
  initialData,
}: {
  engagementId: string;
  role: ChatRole;
  selfUserId: string;
  otherLabel: string;
  initialData: ChatPayload;
}) {
  const queryClient = useQueryClient();
  const channel = engagementChannel(engagementId);

  const { data } = useQuery({
    queryKey: QUERY_KEY(engagementId),
    queryFn: async (): Promise<ChatPayload> => {
      const res = await fetch(`/api/chat/${engagementId}`);
      if (!res.ok) throw new Error(`chat ${res.status}`);
      return (await res.json()) as ChatPayload;
    },
    initialData,
    refetchInterval: 60_000,
  });

  // Push: refetch instantly on a new message OR a read-cursor move (the "Read" receipt).
  useRealtimeInvalidate(channel, "message", QUERY_KEY(engagementId));
  useRealtimeInvalidate(channel, "seen", QUERY_KEY(engagementId));

  // Presence — enter is freelancer-only (the client's entry is owned shell-wide by PortalRealtime).
  // ORDER MATTERS: enter → typing → members, so LIFO unmount cleanup resets typing BEFORE leave.
  usePresenceEnter(role === "freelancer" ? channel : null);
  const setTyping = usePresenceTyping(channel);
  const members = usePresenceMembers(channel);
  const otherOnline = members.some((m) => m.clientId !== selfUserId);
  const otherTyping = members.some((m) => m.clientId !== selfUserId && isTyping(m.data));

  // Advance my read cursor whenever there's something unread + the tab is visible. Driven by the
  // `unread` value (changes only on refetch) + a visibility listener, with an in-flight guard so
  // overlapping runs don't double-fire. NO time-throttle: a throttle could DROP the only mark for a
  // message the user is looking at → the badge sticks AND the other side never gets the "Read"
  // receipt. After marking, the local invalidate refetches → unread → 0 → this re-runs and no-ops.
  const markingRef = useRef(false);
  const unread = data.unreadCount;
  useEffect(() => {
    const markRead = async () => {
      if (markingRef.current) return;
      if (document.visibilityState !== "visible" || unread <= 0) return;
      markingRef.current = true;
      try {
        if (role === "client") await markChatReadAsClientAction();
        else await markChatReadAsFreelancerAction(engagementId);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY(engagementId) });
      } finally {
        markingRef.current = false;
      }
    };
    void markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [unread, role, engagementId, queryClient]);

  // Auto-scroll to the bottom on first mount, and on new messages ONLY when the user is already near
  // the bottom — so reading scrolled-up history isn't yanked away by an arriving message.
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const firstScroll = useRef(true);
  const messages = data.messages;
  useEffect(() => {
    if (messages.length === prevCount.current) return;
    const el = listRef.current;
    if (el) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (firstScroll.current || nearBottom) el.scrollTop = el.scrollHeight;
    }
    prevCount.current = messages.length;
    firstScroll.current = false;
  }, [messages.length]);

  async function handleSend(body: string): Promise<boolean> {
    const res =
      role === "client"
        ? await sendMessageAsClientAction({ body })
        : await sendMessageAsFreelancerAction({ engagementId, body });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY(engagementId) });
      return true;
    }
    toast.error(res.error);
    return false;
  }

  const now = new Date();
  const groups = groupByDay(messages);
  const lastOwnId = lastOwnMessageId(messages, role);

  return (
    <div className="flex h-[70dvh] flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{otherLabel}</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {otherTyping ? "typing…" : otherOnline ? "online" : "offline"}
          </p>
        </div>
        {otherOnline ? (
          <span className="size-2 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
        ) : null}
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-xl">Start the conversation</p>
            <p className="max-w-xs text-balance text-sm text-muted-foreground">
              Messages with {otherLabel} appear here — newest at the bottom.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.dayKey}>
              <div className="my-3 flex justify-center">
                <span
                  suppressHydrationWarning
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {dayLabel(group.dayKey, now)}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {group.messages.map((m) => {
                  const mine = m.senderRole === role;
                  return (
                    <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className="max-w-[80%]">
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                            mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                          )}
                        >
                          {m.body}
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground",
                            mine ? "justify-end" : "justify-start",
                          )}
                        >
                          <time dateTime={m.createdAt} suppressHydrationWarning>
                            {formatTime(m.createdAt)}
                          </time>
                          {mine && m.id === lastOwnId ? (
                            <span>· {isMessageRead(m, data.otherLastReadAt) ? "Read" : "Sent"}</span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <ChatComposer onSend={handleSend} onTyping={setTyping} otherLabel={otherLabel} />
    </div>
  );
}
