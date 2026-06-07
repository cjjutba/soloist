/**
 * Non-blocking GitHub-degraded banner (Story 3.9, UX-DR14). Shown when ≥1 active connection is in
 * `error`. `role="status"` (polite, never blocks the page); it clears automatically when the
 * connection recovers. The reassurance is the load-bearing copy: a connection error pauses ONLY
 * auto-updates — publishing and the Client's published feed are untouched (they never read
 * `repo_connections`), and the manual fallback (Story 3.8) is still available. The Retry lives on
 * the erroring repo card below.
 */
export function GithubDegradedBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      role="status"
      className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="font-medium text-destructive">
        Auto-updates are paused for {count} {count === 1 ? "repository" : "repositories"}.
      </p>
      <p className="mt-1 text-muted-foreground">
        Your published feed and publishing are unaffected — and you can still write updates by hand.
        Use <span className="font-medium">Retry</span> on the repository below once GitHub is reachable
        again.
      </p>
    </div>
  );
}
