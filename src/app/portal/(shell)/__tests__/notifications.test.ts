import { describe, expect, it } from "vitest";
import { notificationPresentation, selectToasts, unreadCount, type NotificationRow } from "../notifications";

const row = (id: string, readAt: string | null): NotificationRow => ({
  id,
  type: "ship_published",
  readAt,
  createdAt: "2026-02-02T00:00:00.000Z",
  shipUpdateId: "s",
  title: "x",
  statusTag: "shipped",
  invoiceId: null,
  invoiceNumber: null,
});

describe("Story 4.1 — unreadCount", () => {
  it("counts only rows with a null readAt", () => {
    expect(unreadCount([])).toBe(0);
    expect(unreadCount([row("a", null), row("b", null)])).toBe(2);
    expect(unreadCount([row("a", null), row("b", "2026-02-03T00:00:00.000Z")])).toBe(1);
    expect(unreadCount([row("a", "2026-02-03T00:00:00.000Z")])).toBe(0);
  });
});

describe("Story 4.2 — selectToasts (toast only on publish-while-active)", () => {
  const active = { hidden: false, resyncing: false };

  it("the FIRST render baselines silently (never toasts existing notifications)", () => {
    const r = selectToasts({ initialized: false, seen: new Set() }, [row("a", null), row("b", null)], active);
    expect(r.toasts).toEqual([]);
    expect([...r.seen].sort()).toEqual(["a", "b"]);
  });

  it("a NEW id while active+not-resyncing → it toasts", () => {
    const r = selectToasts({ initialized: true, seen: new Set(["a"]) }, [row("b", null), row("a", null)], active);
    expect(r.toasts.map((n) => n.id)).toEqual(["b"]); // only the new one
    expect([...r.seen].sort()).toEqual(["a", "b"]);
  });

  it("a NEW id while HIDDEN → no toast (the poll/late-resolve while inactive)", () => {
    const r = selectToasts({ initialized: true, seen: new Set(["a"]) }, [row("b", null), row("a", null)], { hidden: true, resyncing: false });
    expect(r.toasts).toEqual([]);
    expect([...r.seen].sort()).toEqual(["a", "b"]); // baseline still advances
  });

  it("a NEW id on the CATCH-UP refetch (resyncing after hidden) → no burst", () => {
    const r = selectToasts({ initialized: true, seen: new Set(["a"]) }, [row("c", null), row("b", null), row("a", null)], { hidden: false, resyncing: true });
    expect(r.toasts).toEqual([]);
    expect([...r.seen].sort()).toEqual(["a", "b", "c"]);
  });

  it("no new id (e.g. a mark-read re-render) → no toast", () => {
    const r = selectToasts({ initialized: true, seen: new Set(["a", "b"]) }, [row("a", "2026-02-03T00:00:00.000Z"), row("b", null)], active);
    expect(r.toasts).toEqual([]);
  });

  it("a mark-read optimistic change (readAt stamped on EXISTING ids) → no toast (diff is by id)", () => {
    // The center's setQueryData/refetch re-render with the same ids but a new readAt — must not toast.
    const r = selectToasts(
      { initialized: true, seen: new Set(["a", "b"]) },
      [row("a", "2026-02-03T00:00:00.000Z"), row("b", "2026-02-03T00:00:00.000Z")],
      active,
    );
    expect(r.toasts).toEqual([]);
  });

  it("a LARGE batch in one poll (> maxBurst) → suppressed (backlog/catch-up, not live) — race-proof", () => {
    const big = [row("a", null), row("b", null), row("c", null), row("d", null)]; // 4 new > default 3
    const r = selectToasts({ initialized: true, seen: new Set() }, big, { hidden: false, resyncing: false });
    expect(r.toasts).toEqual([]); // no storm even if resync failed to arm
    expect(r.seen.size).toBe(4); // baseline still advances (the bell/center reflect them)
  });

  it("a small batch (≤ maxBurst) of new ids while active → all toast", () => {
    const r = selectToasts({ initialized: true, seen: new Set(["x"]) }, [row("a", null), row("b", null), row("x", null)], { hidden: false, resyncing: false });
    expect(r.toasts.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});

describe("Story 5.2 — notificationPresentation (href + label by type)", () => {
  it("an invoice_sent row → the in-portal invoice link + an invoice label", () => {
    expect(
      notificationPresentation({ type: "invoice_sent", title: null, invoiceId: "inv-9", invoiceNumber: 3 }),
    ).toEqual({ href: "/portal/documents/inv-9", label: "New invoice #3" });
  });

  it("an invoice_sent row with a missing id/number → the documents list + a generic label (no broken url)", () => {
    expect(
      notificationPresentation({ type: "invoice_sent", title: null, invoiceId: null, invoiceNumber: null }),
    ).toEqual({ href: "/portal/documents", label: "New invoice" });
  });

  it("a ship_published row → the feed + the ship title (falls back to 'New update')", () => {
    expect(
      notificationPresentation({ type: "ship_published", title: "Shipped auth", invoiceId: null, invoiceNumber: null }),
    ).toEqual({ href: "/portal", label: "Shipped auth" });
    expect(
      notificationPresentation({ type: "ship_published", title: null, invoiceId: null, invoiceNumber: null }),
    ).toEqual({ href: "/portal", label: "New update" });
  });
});
