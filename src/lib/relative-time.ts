/**
 * Compact relative timestamp for the Cockpit dashboard ("5m ago", "3d ago") — the
 * "Numeric" rendering of last-activity (Story 2.2 / DESIGN.md). Pure + deterministic:
 * pass `now` in tests; defaults to the current time. A future date clamps to "just now"
 * (clock skew should never render "in 3 hours"). No dependency — plain arithmetic.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now"; // invalid date / future / skew → clamp

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
