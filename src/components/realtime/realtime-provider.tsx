"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as Ably from "ably";
import { useQueryClient } from "@tanstack/react-query";

const AblyContext = createContext<Ably.Realtime | null>(null);

/**
 * Opens the client's Ably connection (authenticated via `/api/realtime/token`, which scopes the
 * channels to this session) and provides it via context. Mounted in the portal shell AND the
 * freelancer engagement-detail. The actual subscriptions live in the hooks below.
 *
 * `enabled=false` (key unset server-side) skips the connection entirely → polling only. Created in
 * the `useState` initializer (browser-only; the SSR pass returns null), closed on unmount.
 */
export function RealtimeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [client] = useState<Ably.Realtime | null>(() =>
    enabled && typeof window !== "undefined"
      ? new Ably.Realtime({ authUrl: "/api/realtime/token", authMethod: "POST" })
      : null,
  );

  useEffect(() => {
    if (!client) return;
    return () => client.close();
  }, [client]);

  return <AblyContext.Provider value={client}>{children}</AblyContext.Provider>;
}

/**
 * Subscribe to one channel event and invalidate a query when it fires (+ resync on (re)attach so a
 * signal missed during a disconnect is recovered fast, not at the next poll). No-op until connected.
 */
export function useRealtimeInvalidate(
  channelName: string,
  event: string,
  queryKey: readonly unknown[],
): void {
  const client = useContext(AblyContext);
  const queryClient = useQueryClient();
  const keyStr = JSON.stringify(queryKey);

  useEffect(() => {
    if (!client) return;
    const channel = client.channels.get(channelName);
    const handler = () =>
      queryClient.invalidateQueries({ queryKey: JSON.parse(keyStr) as unknown[] });
    channel.subscribe(event, handler).catch((e: unknown) => console.error("[realtime] subscribe:", e));
    channel.on("attached", handler);
    return () => {
      channel.unsubscribe(event, handler);
      channel.off("attached", handler);
    };
  }, [client, channelName, event, keyStr, queryClient]);
}

/**
 * Subscribe to channel events and `router.refresh()` when any fire — the RSC-refresh variant for
 * the freelancer cockpit (re-runs the server components → fresh "seen"/published/invoice state, no
 * new API). Resyncs on (re)attach. No-op until connected.
 */
export function useRealtimeRefresh(channelName: string, events: readonly string[]): void {
  const client = useContext(AblyContext);
  const router = useRouter();
  const eventsKey = events.join(",");

  useEffect(() => {
    if (!client) return;
    const channel = client.channels.get(channelName);
    const evs = eventsKey.split(",").filter(Boolean);
    const handler = () => router.refresh();
    // NOTE: unlike useRealtimeInvalidate, we do NOT resync on "attached" — router.refresh() re-runs
    // the whole RSC tree, so binding it to reattach would storm the server on a flapping connection.
    // The per-event subscriptions deliver live changes; a missed signal during a brief drop is rare
    // and corrected on the next real signal (or a navigation).
    for (const ev of evs) channel.subscribe(ev, handler).catch((e: unknown) => console.error("[realtime] subscribe:", e));
    return () => {
      for (const ev of evs) channel.unsubscribe(ev, handler);
    };
  }, [client, channelName, eventsKey, router]);
}

/** Enter Ably presence on a channel while mounted (the client announces "I'm viewing"). Leaves on
 * unmount. No-op when realtime is off or the channel is null. */
export function usePresenceEnter(channelName: string | null): void {
  const client = useContext(AblyContext);

  useEffect(() => {
    if (!client || !channelName) return;
    const channel = client.channels.get(channelName);
    // Guard the leave-before-enter-settles race (fast remount / Strict Mode dev): if we've already
    // unmounted by the time enter() resolves, leave immediately so presence doesn't orphan ("stuck
    // viewing now"). The pending enter is also tracked so the cleanup's leave is a safe no-op.
    let left = false;
    channel.presence
      .enter()
      .then(() => {
        if (left) channel.presence.leave().catch(() => {});
      })
      .catch((e: unknown) => console.error("[realtime] presence enter:", e));
    return () => {
      left = true;
      channel.presence.leave().catch(() => {});
    };
  }, [client, channelName]);
}

/** The clientIds currently present on a channel (the freelancer's "● viewing now"). Re-reads on any
 * presence event. Empty until connected / when realtime is off. */
export function usePresenceViewers(channelName: string | null): string[] {
  const client = useContext(AblyContext);
  const [viewers, setViewers] = useState<string[]>([]);

  useEffect(() => {
    if (!client || !channelName) return;
    const channel = client.channels.get(channelName);
    let active = true;
    const refresh = async () => {
      try {
        const members = await channel.presence.get();
        if (active) setViewers(members.map((m) => m.clientId).filter((id): id is string => Boolean(id)));
      } catch {
        /* presence not available yet — ignore */
      }
    };
    channel.presence
      .subscribe(refresh)
      .catch((e: unknown) => console.error("[realtime] presence subscribe:", e));
    void refresh();
    return () => {
      active = false;
      channel.presence.unsubscribe(refresh);
    };
  }, [client, channelName]);

  return viewers;
}
