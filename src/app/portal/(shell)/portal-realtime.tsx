"use client";

import { useEffect, useRef } from "react";
import { usePresenceEnter, useRealtimeInvalidate } from "@/components/realtime/realtime-provider";
import { engagementChannel, userChannel } from "@/lib/realtime-channels";
import { markSeenAction } from "@/server/portal/seen.actions";

const SEEN_THROTTLE_MS = 60_000;

/**
 * Portal-side realtime effects (render-null), mounted shell-wide:
 *  - refetch the shared `["notifications"]` query on the user-channel signal (the bell),
 *  - announce Ably presence on the engagement channel so the freelancer sees "● viewing now",
 *  - stamp "seen" (the client opened the portal) on mount + on tab-focus, throttled to once/min.
 */
export function PortalRealtime({ userId, engagementId }: { userId: string; engagementId: string }) {
  useRealtimeInvalidate(userChannel(userId), "notification", ["notifications"]);
  usePresenceEnter(engagementChannel(engagementId));

  const lastStamp = useRef(0);
  useEffect(() => {
    const stamp = () => {
      const now = Date.now();
      if (now - lastStamp.current < SEEN_THROTTLE_MS) return;
      lastStamp.current = now;
      void markSeenAction();
    };
    stamp(); // the client opened the portal
    const onVisible = () => {
      if (document.visibilityState === "visible") stamp();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
