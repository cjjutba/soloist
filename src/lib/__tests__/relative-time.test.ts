import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../relative-time";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("formatRelativeTime", () => {
  it("sub-minute → 'just now'", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(ago(59 * S), NOW)).toBe("just now");
  });

  it("minutes bucket", () => {
    expect(formatRelativeTime(ago(M), NOW)).toBe("1m ago");
    expect(formatRelativeTime(ago(59 * M), NOW)).toBe("59m ago");
  });

  it("hours bucket", () => {
    expect(formatRelativeTime(ago(H), NOW)).toBe("1h ago");
    expect(formatRelativeTime(ago(23 * H), NOW)).toBe("23h ago");
  });

  it("days bucket", () => {
    expect(formatRelativeTime(ago(D), NOW)).toBe("1d ago");
    expect(formatRelativeTime(ago(6 * D), NOW)).toBe("6d ago");
  });

  it("weeks bucket (7–29 days)", () => {
    expect(formatRelativeTime(ago(7 * D), NOW)).toBe("1w ago");
    expect(formatRelativeTime(ago(29 * D), NOW)).toBe("4w ago");
  });

  it("months bucket (30–364 days)", () => {
    expect(formatRelativeTime(ago(30 * D), NOW)).toBe("1mo ago");
    expect(formatRelativeTime(ago(364 * D), NOW)).toBe("12mo ago");
  });

  it("years bucket", () => {
    expect(formatRelativeTime(ago(365 * D), NOW)).toBe("1y ago");
    expect(formatRelativeTime(ago(800 * D), NOW)).toBe("2y ago");
  });

  it("future date clamps to 'just now' (never 'in …')", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 3 * H), NOW)).toBe("just now");
  });

  it("an invalid date clamps to 'just now' (never 'NaNy ago')", () => {
    expect(formatRelativeTime(new Date("nonsense"), NOW)).toBe("just now");
  });
});
