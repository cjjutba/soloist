import { describe, expect, it } from "vitest";
import { bucketByWeek, pickDominantCurrency, summarizeDashboard } from "../overview-summary";
import { buildCockpitChrome } from "../chrome";
import { startOfMonthUTC, weeksAgoUTC } from "../dates";
import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

const eng = (over: Partial<DashboardEngagement>): DashboardEngagement =>
  ({
    id: "e", tenantId: "t", clientDisplayName: "C", name: "N", scope: null, status: "active",
    lastActivityAt: new Date("2026-06-01T00:00:00Z"), freelancerChatLastReadAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    candidateCount: 0, lastSeenAt: null, chatUnreadCount: 0, ...over,
  }) as DashboardEngagement;

describe("summarizeDashboard", () => {
  it("counts engagements and sums candidate + unread totals", () => {
    const rows = [
      eng({ id: "a", candidateCount: 3, chatUnreadCount: 2 }),
      eng({ id: "b", candidateCount: 1, chatUnreadCount: 0 }),
    ];
    expect(summarizeDashboard(rows)).toEqual({ activeEngagements: 2, awaitingCuration: 4, unreadMessages: 2 });
  });
  it("is all-zero for an empty workspace", () => {
    expect(summarizeDashboard([])).toEqual({ activeEngagements: 0, awaitingCuration: 0, unreadMessages: 0 });
  });
});

describe("buildCockpitChrome", () => {
  it("projects engagements, active count, and only attention-needing rows", () => {
    const rows = [
      eng({ id: "a", name: "Alpha", candidateCount: 2, chatUnreadCount: 0 }),
      eng({ id: "b", name: "Beta", candidateCount: 0, chatUnreadCount: 0 }),
      eng({ id: "c", name: "Gamma", candidateCount: 0, chatUnreadCount: 3 }),
    ];
    const chrome = buildCockpitChrome(rows);
    expect(chrome.engagementsActiveCount).toBe(3);
    expect(chrome.engagements).toEqual([
      { id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" },
    ]);
    expect(chrome.attention.map((a) => a.id)).toEqual(["a", "c"]); // Beta excluded
  });
});

describe("bucketByWeek", () => {
  const now = new Date("2026-06-13T12:00:00Z"); // a Saturday
  it("produces N consecutive week buckets ending with the current week", () => {
    const buckets = bucketByWeek([], 6, now);
    expect(buckets).toHaveLength(6);
    expect(buckets[5].weekStart).toBe("2026-06-08"); // Monday of the week containing 2026-06-13
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });
  it("counts dates into their Monday-started week, ignoring out-of-window dates", () => {
    const buckets = bucketByWeek(
      [new Date("2026-06-13T00:00:00Z"), new Date("2026-06-09T00:00:00Z"), new Date("2026-01-01T00:00:00Z")],
      6, now,
    );
    expect(buckets[5].count).toBe(2); // both June 9 + June 13 fall in week starting June 8
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(2); // Jan 1 is out of the 6-week window
  });
});

describe("pickDominantCurrency", () => {
  it("returns the largest bucket, or null when empty", () => {
    expect(pickDominantCurrency([])).toBeNull();
    expect(pickDominantCurrency([{ currency: "PHP", minor: 100 }, { currency: "USD", minor: 900 }]))
      .toEqual({ currency: "USD", minor: 900 });
  });
});

describe("date helpers", () => {
  it("startOfMonthUTC returns the 1st at UTC midnight", () => {
    expect(startOfMonthUTC(new Date("2026-06-13T12:00:00Z")).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
  it("weeksAgoUTC subtracts whole weeks", () => {
    expect(weeksAgoUTC(new Date("2026-06-13T00:00:00Z"), 6).toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });
});
