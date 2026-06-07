import { describe, expect, it } from "vitest";
import {
  computeAmountTotal,
  computeLineTotal,
  currencyFractionDigits,
  formatMoney,
  toMinorUnits,
} from "../money";

describe("Story 5.1 — money helpers (integer minor units, no float math)", () => {
  it("computeLineTotal rounds ONCE at the line boundary (fractional quantity → integer minor units)", () => {
    expect(computeLineTotal({ quantity: 2.5, unitAmount: 10000 })).toBe(25000); // 2.5 × ₱100.00
    expect(computeLineTotal({ quantity: 3, unitAmount: 333 })).toBe(999);
    // A fractional product rounds to the nearest minor unit (no trailing float).
    expect(computeLineTotal({ quantity: 1.5, unitAmount: 333 })).toBe(500); // 499.5 → 500
  });

  it("computeAmountTotal is pure integer summation of line totals", () => {
    const total = computeAmountTotal([
      { quantity: 2, unitAmount: 5000 },
      { quantity: 1, unitAmount: 250 },
      { quantity: 2.5, unitAmount: 10000 },
    ]);
    expect(total).toBe(10000 + 250 + 25000);
    expect(Number.isInteger(total)).toBe(true);
    expect(computeAmountTotal([])).toBe(0);
  });

  it("currencyFractionDigits derives the right minor-unit digits per currency", () => {
    expect(currencyFractionDigits("PHP")).toBe(2);
    expect(currencyFractionDigits("USD")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0); // yen has no minor unit
  });

  it("toMinorUnits converts a major-unit amount to integer minor units", () => {
    expect(toMinorUnits(1500, "PHP")).toBe(150000);
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(1500, "JPY")).toBe(1500); // 0-decimal → unchanged
  });

  it("formatMoney renders integer minor units via Intl.NumberFormat for PHP/USD/JPY", () => {
    // Don't assert exact symbol/locale glyphs (runtime-dependent) — assert the magnitude is right.
    expect(formatMoney(150000, "PHP")).toMatch(/1,500\.00/);
    expect(formatMoney(1999, "USD")).toMatch(/19\.99/);
    // JPY (0-decimal): 1500 minor units = ¥1,500, NOT ¥15.00.
    expect(formatMoney(1500, "JPY")).toMatch(/1,500/);
    expect(formatMoney(1500, "JPY")).not.toMatch(/15\.00/);
  });

  it("formatMoney falls back to a plain string for an unrenderable currency (never throws at render)", () => {
    expect(() => formatMoney(150000, "P!P")).not.toThrow();
    expect(formatMoney(150000, "P!P")).toContain("P!P");
  });
});
