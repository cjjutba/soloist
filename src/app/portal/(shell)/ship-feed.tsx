"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FocusHeading } from "@/components/ui/focus-heading";
import { SHIP_STATUS, SHIP_STATUS_KEYS, toShipStatus } from "@/components/ui/ship-status";
import { useRealtimeInvalidate } from "@/components/realtime/realtime-provider";
import { engagementChannel } from "@/lib/realtime-channels";
import { cn } from "@/lib/utils";
import { ShipUpdateCard } from "./ship-update-card";
import { filterUpdates, newTopAnnouncement, type FeedFilter, type FeedUpdate } from "./feed";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  ...SHIP_STATUS_KEYS.map((k) => ({ key: k, label: `${SHIP_STATUS[k].emoji} ${SHIP_STATUS[k].label}` })),
];

const statusLabel = (tag: string) => SHIP_STATUS[toShipStatus(tag)].label;

/**
 * The live Client Ship Feed (Story 3.7; realtime as of the Ably slice) — RSC seeds `initialUpdates`;
 * this island refetches `GET /api/feed/[engagementId]` INSTANTLY on the `ship.published` realtime
 * signal (Ably), with a 60s poll (+ on focus) as the fallback. Renders published updates
 * newest-first, filterable by status. A new top item is
 * announced via a visually-hidden `aria-live="polite"` region WITHOUT moving focus; the cards
 * animate in under `motion-safe`. Always mounted (even empty) so the first update arrives live.
 */
export function ShipFeed({
  engagementId,
  initialUpdates,
  tenantName,
}: {
  engagementId: string;
  initialUpdates: FeedUpdate[];
  tenantName: string;
}) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [announcement, setAnnouncement] = useState("");
  const initialized = useRef(false);
  const prevTopId = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["feed", engagementId],
    queryFn: async (): Promise<FeedUpdate[]> => {
      const res = await fetch(`/api/feed/${engagementId}`);
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const json = (await res.json()) as { updates: FeedUpdate[] };
      return json.updates;
    },
    initialData: initialUpdates,
    // Realtime makes this instant; the poll is now just a slow fallback for when Ably can't connect.
    refetchInterval: 60_000,
  });

  // Push: refetch the instant a new update is published to this engagement (the publish fan-out
  // signals `ship.published` on the engagement channel). No-op if realtime is disabled → the poll
  // above covers it.
  useRealtimeInvalidate(engagementChannel(engagementId), "ship.published", ["feed", engagementId]);

  // `initialData` guarantees `data` is never undefined, so this is the stable query array (no
  // `?? []` that would churn the effect dep every render).
  const updates = data;

  // Announce a new top item (UX-DR15) — no focus move. The first render is skipped (existing
  // updates aren't "new arrivals"); only updates that ARRIVE while viewing are announced.
  useEffect(() => {
    const msg = newTopAnnouncement(initialized.current, prevTopId.current, updates, statusLabel);
    if (msg) setAnnouncement(msg);
    initialized.current = true;
    prevTopId.current = updates[0]?.id ?? null;
  }, [updates]);

  const filtered = filterUpdates(updates, filter);

  return (
    <div className="flex flex-col gap-4">
      {/* The h1 landmark is STABLE (always mounted) so it focuses on NAVIGATION only (pathname
          change) — never on the empty→populated data transition, which would steal focus mid-view
          (the AC's forbidden focus move). The visible content is the cards / the empty hero. */}
      <FocusHeading className="sr-only">Ship Feed</FocusHeading>

      {updates.length === 0 ? (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
          <p className="font-display text-3xl">{tenantName} is getting set up</p>
          <p className="max-w-sm text-balance text-muted-foreground">
            Your first update will land here soon — newest first, in plain English.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No updates with that status yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((u) => (
                <li key={u.id}>
                  <ShipUpdateCard update={u} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
