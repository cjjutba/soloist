import { describe, expect, it } from "vitest";
import { unreadCount, type NotificationRow } from "../notifications";

const row = (id: string, readAt: string | null): NotificationRow => ({
  id,
  type: "ship_published",
  readAt,
  createdAt: "2026-02-02T00:00:00.000Z",
  shipUpdateId: "s",
  title: "x",
  statusTag: "shipped",
});

describe("Story 4.1 — unreadCount", () => {
  it("counts only rows with a null readAt", () => {
    expect(unreadCount([])).toBe(0);
    expect(unreadCount([row("a", null), row("b", null)])).toBe(2);
    expect(unreadCount([row("a", null), row("b", "2026-02-03T00:00:00.000Z")])).toBe(1);
    expect(unreadCount([row("a", "2026-02-03T00:00:00.000Z")])).toBe(0);
  });
});
