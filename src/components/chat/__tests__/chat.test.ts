import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay, isMessageRead, lastOwnMessageId, type ChatMessage } from "../chat";

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  senderRole: "client",
  senderUserId: "u",
  body: "hi",
  createdAt: "2026-06-10T08:00:00.000Z",
  ...over,
});

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("groupByDay", () => {
  it("groups consecutive (chronological) messages into calendar-day buckets", () => {
    const groups = groupByDay([
      msg({ id: "c", createdAt: isoDaysAgo(2) }),
      msg({ id: "a", createdAt: isoDaysAgo(0) }),
      msg({ id: "b", createdAt: isoDaysAgo(0) }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["c"]);
    expect(groups[1].messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("empty in → empty out", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("dayLabel", () => {
  it("labels today / yesterday relative to now", () => {
    const now = new Date();
    const todayKey = groupByDay([msg({ createdAt: now.toISOString() })])[0].dayKey;
    expect(dayLabel(todayKey, now)).toBe("Today");

    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const yKey = groupByDay([msg({ createdAt: y.toISOString() })])[0].dayKey;
    expect(dayLabel(yKey, now)).toBe("Yesterday");
  });

  it("labels an older day with a date (not Today/Yesterday)", () => {
    const now = new Date("2026-06-15T12:00:00");
    const olderKey = groupByDay([msg({ createdAt: new Date("2026-06-10T12:00:00").toISOString() })])[0].dayKey;
    const label = dayLabel(olderKey, now);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("lastOwnMessageId", () => {
  it("returns the id of the last message authored by the given role", () => {
    const ms = [
      msg({ id: "1", senderRole: "client" }),
      msg({ id: "2", senderRole: "freelancer" }),
      msg({ id: "3", senderRole: "client" }),
    ];
    expect(lastOwnMessageId(ms, "client")).toBe("3");
    expect(lastOwnMessageId(ms, "freelancer")).toBe("2");
  });

  it("null when I've sent nothing / the thread is empty", () => {
    expect(lastOwnMessageId([], "client")).toBeNull();
    expect(lastOwnMessageId([msg({ senderRole: "client" })], "freelancer")).toBeNull();
  });
});

describe("isMessageRead", () => {
  const m1 = msg({ createdAt: "2026-06-10T08:00:00.000Z" });
  it("unread when the other cursor is null or before the message", () => {
    expect(isMessageRead(m1, null)).toBe(false);
    expect(isMessageRead(m1, "2026-06-10T07:59:59.000Z")).toBe(false);
  });
  it("read when the other cursor is at/after the message time", () => {
    expect(isMessageRead(m1, "2026-06-10T08:00:00.000Z")).toBe(true);
    expect(isMessageRead(m1, "2026-06-10T09:00:00.000Z")).toBe(true);
  });
});
