"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SHIP_STATUS, toShipStatus } from "@/components/ui/ship-status";
import { notificationPresentation, selectToasts, type NotificationRow } from "./notifications";

/**
 * Toast on publish WHILE ACTIVE (Story 4.2) — a render-null island mounted portal-wide. Polls the
 * SAME `["notifications"]` query as the bell/center (deduped); on a freshly-arrived `ship_published`
 * notification it fires a non-blocking sonner toast linking to the feed. `selectToasts` gates it to
 * "published while I'm watching": the first render baselines silently, and a catch-up refetch after
 * the tab was hidden (tracked via `visibilitychange`) doesn't burst the backlog. The poll itself is
 * paused while hidden (TanStack default), so an inactive client never toasts.
 */
export function NotificationToaster() {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const resync = useRef(false);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      const json = (await res.json()) as { notifications: NotificationRow[] };
      return json.notifications;
    },
    refetchInterval: 20_000,
  });

  // The tab going hidden marks the next data change (the focus-return refetch) as catch-up.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) resync.current = true;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!data) return;
    const { toasts, seen: nextSeen } = selectToasts(
      { initialized: initialized.current, seen: seen.current },
      data,
      { hidden: document.hidden, resyncing: resync.current },
    );
    seen.current = nextSeen;
    initialized.current = true;
    resync.current = false;
    // selectToasts already suppresses a large batch (the anti-burst threshold), so this never storms.
    for (const n of toasts) {
      const { href, label } = notificationPresentation(n); // one source of truth (href + base label)
      const s = n.statusTag ? SHIP_STATUS[toShipStatus(n.statusTag)] : null;
      const isInvoice = n.type === "invoice_sent";
      toast(s ? `${s.emoji} ${label}` : label, {
        description: isInvoice ? "New invoice in your documents" : "New update in your feed",
        action: { label: "View", onClick: () => router.push(href) },
      });
    }
  }, [data, router]);

  return null;
}
