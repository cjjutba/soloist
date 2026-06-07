import { ShipStatusTag } from "@/components/ui/ship-status-tag";
import { formatRelativeTime } from "@/lib/relative-time";
import type { FeedUpdate } from "./feed";

/**
 * The Client feed's hero object (Story 3.7, DESIGN ship-update-card) — read-only: a status tag,
 * the plain-English title, a 1–2 line summary, and a relative timestamp. NEVER renders raw dev
 * artifacts (none are even in `FeedUpdate`). The `motion-safe:animate-in` runs once on mount, so a
 * newly-polled card slides in while existing (same-key) cards don't re-animate; reduced-motion → instant.
 */
export function ShipUpdateCard({ update }: { update: FeedUpdate }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-border bg-card p-4 text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
      <ShipStatusTag status={update.statusTag} />
      <h3 className="mt-2 text-sm font-medium">{update.title}</h3>
      {update.summary ? (
        <p className="mt-1 text-sm text-muted-foreground">{update.summary}</p>
      ) : null}
      {update.publishedAt ? (
        // suppressHydrationWarning: the relative time is computed against `now`, so the SSR text can
        // differ from the client's at a bucket boundary ("4m"→"5m"); the client value wins, no warning.
        <time
          dateTime={update.publishedAt}
          suppressHydrationWarning
          className="mt-2 block font-mono text-xs text-muted-foreground"
        >
          {formatRelativeTime(new Date(update.publishedAt))}
        </time>
      ) : null}
    </article>
  );
}
