/** Pure chat helpers — types, day-grouping, day labels, and read-receipt logic. No React, no I/O,
 * so they're unit-testable in isolation (the thread component is the thin shell around these). */

export type ChatRole = "freelancer" | "client";

/** A message as it crosses the wire from `GET /api/chat/[engagementId]` (Dates are ISO strings). */
export type ChatMessage = {
  id: string;
  senderRole: ChatRole;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export type ChatPayload = {
  messages: ChatMessage[];
  unreadCount: number;
  /** The OTHER party's read cursor (ISO) — drives the "Read" receipt. null = never read. */
  otherLastReadAt: string | null;
};

export type ChatDayGroup = { dayKey: string; messages: ChatMessage[] };

/** Local Y-M-D key for a date (calendar-day bucketing in the viewer's timezone). */
function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Group chronological messages into consecutive calendar-day buckets (local time). */
export function groupByDay(messages: ChatMessage[]): ChatDayGroup[] {
  const groups: ChatDayGroup[] = [];
  for (const m of messages) {
    const dayKey = localKey(new Date(m.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) last.messages.push(m);
    else groups.push({ dayKey, messages: [m] });
  }
  return groups;
}

/** A human day-separator label relative to `now`: "Today" / "Yesterday" / "Jan 5" / "Jan 5, 2024". */
export function dayLabel(dayKey: string, now: Date): string {
  if (dayKey === localKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey === localKey(yesterday)) return "Yesterday";
  const [yr, mo, da] = dayKey.split("-").map(Number);
  const d = new Date(yr, mo - 1, da);
  return d.toLocaleDateString(
    undefined,
    yr === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

/** The id of the most recent message authored by `selfRole` — where the "Read" receipt renders
 * (only under the last of my messages, iMessage-style). null if I've sent nothing. */
export function lastOwnMessageId(messages: ChatMessage[], selfRole: ChatRole): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].senderRole === selfRole) return messages[i].id;
  }
  return null;
}

/** Whether the other party has read a message — their read cursor is at/after the message time. */
export function isMessageRead(message: ChatMessage, otherLastReadAt: string | null): boolean {
  if (!otherLastReadAt) return false;
  return new Date(message.createdAt).getTime() <= new Date(otherLastReadAt).getTime();
}
