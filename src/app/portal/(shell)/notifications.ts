/** A Client notification as the center/bell see it — the joined projection (Story 4.1), with
 * `readAt`/`createdAt` as ISO strings (they cross the wire via `Response.json` + the RSC seed).
 * `title`/`statusTag` come from the linked ship_update (null for non-`ship_published` types). */
export type NotificationRow = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  shipUpdateId: string | null;
  title: string | null;
  statusTag: string | null;
};

/** Unread count for the bell badge (absent at zero). Pure → node-unit-tested. */
export function unreadCount(rows: NotificationRow[]): number {
  return rows.reduce((n, r) => (r.readAt == null ? n + 1 : n), 0);
}
