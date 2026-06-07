import { describe, expect, it } from "vitest";
import { isEditableTarget, nextIndex } from "../keyboard";

describe("Story 3.5 — curation keyboard helpers", () => {
  it("isEditableTarget: suppresses inside text fields / contenteditable, not elsewhere", () => {
    expect(isEditableTarget("INPUT")).toBe(true);
    expect(isEditableTarget("textarea")).toBe(true); // case-insensitive
    expect(isEditableTarget("SELECT")).toBe(true);
    expect(isEditableTarget("DIV", true)).toBe(true); // contenteditable
    expect(isEditableTarget("BUTTON")).toBe(false);
    expect(isEditableTarget("DIV")).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });

  it("nextIndex: clamped j/k navigation (no wrap), from no-focus, and on an empty list", () => {
    expect(nextIndex(-1, 3, 1)).toBe(0); // j from nothing → first
    expect(nextIndex(-1, 3, -1)).toBe(2); // k from nothing → last
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(0, 3, -1)).toBe(0); // clamp at top
    expect(nextIndex(2, 3, 1)).toBe(2); // clamp at bottom
    expect(nextIndex(1, 0, 1)).toBe(-1); // empty list
  });
});
