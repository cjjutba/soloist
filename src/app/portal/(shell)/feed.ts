import { type ShipStatus, toShipStatus } from "@/components/ui/ship-status";

/** A published Ship Update as the Client feed sees it — the Client-safe projection (Story 3.6's
 * `listPublishedUpdates`), with `publishedAt` as an ISO string (it crosses the wire via
 * `Response.json` on the poll and `.toISOString()` from the RSC first paint). NEVER `raw_meta`. */
export type FeedUpdate = {
  id: string;
  statusTag: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
};

export type FeedFilter = "all" | ShipStatus;

/** Status filter (Story 3.7, FR-14). An unknown statusTag is BUCKETED via `toShipStatus` (so a
 * stray value is shown under In Progress, never silently dropped from the feed). */
export function filterUpdates(updates: FeedUpdate[], filter: FeedFilter): FeedUpdate[] {
  if (filter === "all") return updates;
  return updates.filter((u) => toShipStatus(u.statusTag) === filter);
}

/** The `aria-live` announcement when a NEW update has appeared at the top since the last poll, else
 * null (UX-DR15). `initialized` is false on the very first render so the initial paint of existing
 * updates is NOT announced — only updates that ARRIVE while viewing. Null when the top is unchanged
 * or the feed is empty. Pure → unit-tested without a DOM. */
export function newTopAnnouncement(
  initialized: boolean,
  prevTopId: string | null,
  updates: FeedUpdate[],
  statusLabel: (statusTag: string) => string,
): string | null {
  const top = updates[0];
  if (!initialized || !top || top.id === prevTopId) return null;
  return `New update: ${top.title}, ${statusLabel(top.statusTag)}`;
}
