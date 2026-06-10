/** A Client notification as the center/bell see it — the joined projection (Story 4.1/5.2), with
 * `readAt`/`createdAt` as ISO strings (they cross the wire via `Response.json` + the RSC seed).
 * `title`/`statusTag` come from the linked ship_update (null for non-ship types); `invoiceNumber`
 * from the linked invoice (null for non-invoice types). The center derives href/label from `type`. */
export type NotificationRow = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  shipUpdateId: string | null;
  title: string | null;
  statusTag: string | null;
  invoiceId: string | null;
  invoiceNumber: number | null;
};

/** The destination + label for a notification row, by type (Story 5.2) — pure so the center, bell,
 * and toaster all read one source of truth. `invoice_sent` → the in-portal invoice; otherwise the
 * ship feed. Guards a null id (links to the list/feed root rather than a broken url). */
export function notificationPresentation(
  row: Pick<NotificationRow, "type" | "title" | "invoiceId" | "invoiceNumber">,
): { href: string; label: string } {
  if (row.type === "invoice_sent") {
    return {
      href: row.invoiceId ? `/portal/documents/${row.invoiceId}` : "/portal/documents",
      label: row.invoiceNumber != null ? `New invoice #${row.invoiceNumber}` : "New invoice",
    };
  }
  return { href: "/portal", label: row.title ?? "New update" };
}

/** Unread count for the bell badge (absent at zero). Pure → node-unit-tested. */
export function unreadCount(rows: NotificationRow[]): number {
  return rows.reduce((n, r) => (r.readAt == null ? n + 1 : n), 0);
}

/**
 * Decide which freshly-arrived notifications should toast (Story 4.2), purely. The toast is the
 * "published while I'm watching" signal — so:
 *  - the FIRST render never toasts (baseline the existing notifications);
 *  - a CATCH-UP refetch (the tab was hidden → just returned) or a poll that resolved while HIDDEN
 *    never toasts (those accumulated while inactive — the bell badge/center cover them silently);
 *  - otherwise, the ids not in `prev.seen` are the genuine new arrivals.
 * Always returns the current `seen` set so the caller updates its baseline either way.
 */
export function selectToasts(
  prev: { initialized: boolean; seen: Set<string> },
  data: NotificationRow[],
  ctx: { hidden: boolean; resyncing: boolean; maxBurst?: number },
): { toasts: NotificationRow[]; seen: Set<string> } {
  const seen = new Set(data.map((n) => n.id));
  if (!prev.initialized || ctx.resyncing || ctx.hidden) return { toasts: [], seen };
  const fresh = data.filter((n) => !prev.seen.has(n.id));
  // ROBUST anti-burst backstop: a large batch in ONE poll is almost certainly a catch-up/backlog
  // (a return from a hidden/background tab, or a hidden-at-mount tab whose visibility edge the
  // `resyncing` flag missed) — NOT live publishing, which lands 1–2 at a time. Suppress it so a
  // backlog can never storm the screen, regardless of whether the resync flag armed (the badge +
  // center still reflect them). This doesn't depend on visibility-event timing, so it's race-proof.
  if (fresh.length > (ctx.maxBurst ?? 3)) return { toasts: [], seen };
  return { toasts: fresh, seen };
}
