"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Ably from "ably";
import { useQueryClient } from "@tanstack/react-query";
import { userChannel } from "@/lib/realtime-channels";

const AblyContext = createContext<Ably.Realtime | null>(null);

/**
 * Opens the client's Ably connection (authenticated via `/api/realtime/token`, which scopes the
 * channels to this session) and wires the shell-wide notification signal: the bell + center +
 * toaster all share the `["notifications"]` query, so subscribing the user channel here and
 * invalidating on a `"notification"` event refreshes all three instantly.
 *
 * Surfaces with their own channel (e.g. the feed → its engagement channel) use
 * `useRealtimeInvalidate`. Everything degrades to the fallback poll if Ably can't connect:
 * `enabled=false` (key unset server-side) skips the connection entirely.
 */
export function RealtimeProvider({
  userId,
  enabled,
  children,
}: {
  userId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  // Create the connection once, in the browser only (the SSR pass returns null — effects/subscribe
  // run client-side). authMethod POST matches the token route. `enabled=false` (key unset
  // server-side) skips it entirely → polling only.
  const [client] = useState<Ably.Realtime | null>(() =>
    enabled && typeof window !== "undefined"
      ? new Ably.Realtime({ authUrl: "/api/realtime/token", authMethod: "POST" })
      : null,
  );

  // Close the connection when the shell unmounts.
  useEffect(() => {
    if (!client) return;
    return () => client.close();
  }, [client]);

  // Shell-wide notification signal → refetch the shared notifications query.
  useEffect(() => {
    if (!client) return;
    const channel = client.channels.get(userChannel(userId));
    const onNotify = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
    channel
      .subscribe("notification", onNotify)
      .catch((e: unknown) => console.error("[realtime] notifications subscribe failed:", e));
    // Resync on (re)attach — recovers a signal missed during a disconnect (else the bell stays
    // stale until the 60s fallback poll). Also covers the initial attach (a cheap fresh refetch).
    channel.on("attached", onNotify);
    return () => {
      channel.unsubscribe("notification", onNotify);
      channel.off("attached", onNotify);
    };
  }, [client, userId, queryClient]);

  return <AblyContext.Provider value={client}>{children}</AblyContext.Provider>;
}

/**
 * Subscribe to one channel event and invalidate a query when it fires. No-op until the Ably client
 * has connected (and forever if realtime is disabled) — the surface's fallback poll covers that.
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
    channel
      .subscribe(event, handler)
      .catch((e: unknown) => console.error("[realtime] subscribe failed:", e));
    // Resync on (re)attach so a signal missed during a disconnect is recovered fast (not at the 60s poll).
    channel.on("attached", handler);
    return () => {
      channel.unsubscribe(event, handler);
      channel.off("attached", handler);
    };
  }, [client, channelName, event, keyStr, queryClient]);
}
