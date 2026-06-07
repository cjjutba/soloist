import { describe, expect, it } from "vitest";
import { SHIP_STATUS, SHIP_STATUS_KEYS, toShipStatus } from "../ship-status";

describe("Story 3.5 — SHIP_STATUS vocabulary (single source of truth)", () => {
  it("maps each key to the right label + emoji", () => {
    expect(SHIP_STATUS.shipped).toMatchObject({ label: "Shipped", emoji: "✅" });
    expect(SHIP_STATUS.in_progress).toMatchObject({ label: "In Progress", emoji: "🚧" });
    expect(SHIP_STATUS.next).toMatchObject({ label: "Next", emoji: "📦" });
  });

  it("SHIP_STATUS_KEYS is the 1/2/3 order, length 3", () => {
    expect(SHIP_STATUS_KEYS).toEqual(["shipped", "in_progress", "next"]);
  });

  it("toShipStatus falls back to in_progress for unknown / prototype-key input", () => {
    expect(toShipStatus("shipped")).toBe("shipped");
    expect(toShipStatus("next")).toBe("next");
    expect(toShipStatus("garbage")).toBe("in_progress");
    expect(toShipStatus("constructor")).toBe("in_progress"); // Object.hasOwn guard
    expect(toShipStatus("toString")).toBe("in_progress");
  });
});
