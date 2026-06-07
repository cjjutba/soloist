import { describe, expect, it } from "vitest";
import { filterUpdates, newTopAnnouncement, type FeedUpdate } from "../feed";

const mk = (id: string, statusTag: string, title = id): FeedUpdate => ({
  id,
  statusTag,
  title,
  summary: null,
  publishedAt: "2026-06-07T00:00:00.000Z",
});

const label = (tag: string) =>
  ({ shipped: "Shipped", in_progress: "In Progress", next: "Next" })[tag] ?? "In Progress";

describe("Story 3.7 — feed helpers", () => {
  it("filterUpdates: 'all' keeps everything; a status keeps only that; an unknown tag buckets to in_progress", () => {
    const list = [mk("a", "shipped"), mk("b", "in_progress"), mk("c", "next"), mk("d", "bogus")];
    expect(filterUpdates(list, "all")).toHaveLength(4);
    expect(filterUpdates(list, "shipped").map((u) => u.id)).toEqual(["a"]);
    expect(filterUpdates(list, "next").map((u) => u.id)).toEqual(["c"]);
    // "bogus" buckets to in_progress → it's shown there, never dropped from the feed.
    expect(filterUpdates(list, "in_progress").map((u) => u.id)).toEqual(["b", "d"]);
  });

  it("newTopAnnouncement: null on first render / unchanged top / empty; a message on a new top", () => {
    const list = [mk("a", "shipped", "Made login faster")];
    expect(newTopAnnouncement(false, null, list, label)).toBeNull(); // first render — don't announce
    expect(newTopAnnouncement(true, "a", list, label)).toBeNull(); // top unchanged
    expect(newTopAnnouncement(true, null, list, label)).toBe("New update: Made login faster, Shipped"); // first arrival
    expect(newTopAnnouncement(true, "a", [], label)).toBeNull(); // empty

    const list2 = [mk("b", "next", "Planned redesign"), mk("a", "shipped")];
    expect(newTopAnnouncement(true, "a", list2, label)).toBe("New update: Planned redesign, Next");
  });
});
