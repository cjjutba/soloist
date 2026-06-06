import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  deriveAccentText,
  guardAccent,
  nearestPassingFill,
  PAPER,
  WHITE,
} from "../contrast";

const IRIS = "#5B5BD6";

describe("contrastRatio", () => {
  it("matches DESIGN.md measured anchors for Soloist Iris", () => {
    expect(contrastRatio(WHITE, IRIS)).toBeCloseTo(5.37, 1); // white on fill
    expect(contrastRatio(IRIS, PAPER)).toBeCloseTo(5.15, 1); // accent as text on Paper
  });
  it("is 1 for identical colors and ~21 for black/white (symmetric)", () => {
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("guardAccent", () => {
  it("accepts Soloist Iris unchanged — passes all three checks", () => {
    const r = guardAccent(IRIS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accentHex).toBe(IRIS);
      expect(r.accentTextHex).toBe(IRIS); // already legible as text → not darkened
      expect(r.focusRingFallback).toBe(false); // 5.15 ≥ 3.0
    }
  });

  it("accepts a dark accent and never sets the focus-ring fallback for it", () => {
    const r = guardAccent("#0F766E"); // teal, dark enough for white text
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.focusRingFallback).toBe(false);
  });

  it("blocks a too-light accent and suggests a darker shade that passes", () => {
    const r = guardAccent("#FFD700"); // gold — white text unreadable
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.suggestion).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastRatio(WHITE, r.suggestion)).toBeGreaterThanOrEqual(4.5); // suggestion passes
      expect(contrastRatio(WHITE, r.suggestion)).toBeGreaterThan(contrastRatio(WHITE, "#FFD700")); // darker
      expect(r.error).toMatch(/4\.5/);
    }
  });

  it("normalizes input casing to #RRGGBB uppercase", () => {
    const r = guardAccent("#5b5bd6");
    expect(r.ok && r.accentHex).toBe(IRIS);
  });

  it("rejects malformed hex instead of returning a garbage (NaN) shade", () => {
    for (const bad of ["not-a-color", "#abc", "#GG0000", "5B5BD6", "#5B5BD"]) {
      const r = guardAccent(bad);
      expect(r.ok).toBe(false);
    }
  });
});

describe("deriveAccentText (decoupled, auto-darkened text token)", () => {
  it("returns a shade legible as text on BOTH Paper and white", () => {
    const text = deriveAccentText("#8A8AE8"); // lighter iris — marginal as text
    expect(contrastRatio(text, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
  it("leaves an already-legible accent unchanged", () => {
    expect(deriveAccentText(IRIS)).toBe(IRIS);
  });
});

describe("nearestPassingFill", () => {
  it("returns a shade where white-on-fill ≥ 4.5", () => {
    expect(contrastRatio(WHITE, nearestPassingFill("#FFD700"))).toBeGreaterThanOrEqual(4.5);
  });
});
