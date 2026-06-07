/**
 * Money helpers for the Doc Engine (Story 5.1) — doc-type-agnostic (the `DocumentType` seam reuses
 * them). **All amounts are integer MINOR units** (e.g. centavos/cents); float math is forbidden for
 * money (architecture.md L297). The only rounding is the single `Math.round` at the line boundary
 * (`quantity` may be fractional, e.g. 2.5 hours); totals are pure integer summation.
 */

/** The money-bearing shape of a line item — `unitAmount` is integer minor units. */
export type MoneyLineItem = { quantity: number; unitAmount: number };

/** One line's total in integer minor units. The ONE rounding step (fractional quantity → integer). */
export function computeLineTotal(item: MoneyLineItem): number {
  return Math.round(item.quantity * item.unitAmount);
}

/** The invoice total in integer minor units — pure integer summation of the line totals. */
export function computeAmountTotal(items: readonly MoneyLineItem[]): number {
  return items.reduce((sum, item) => sum + computeLineTotal(item), 0);
}

/**
 * The number of minor-unit digits for a currency (PHP/USD → 2, JPY → 0), derived from the currency
 * itself so callers never hardcode `100`. Falls back to 2 if the runtime can't resolve it.
 */
export function currencyFractionDigits(currency: string): number {
  try {
    const opts = new Intl.NumberFormat(undefined, { style: "currency", currency }).resolvedOptions();
    return opts.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Format integer minor units as a localized currency string (`Intl.NumberFormat`, never float math
 * for storage — the division here is display-only, at the boundary). Falls back to a plain string if
 * the currency code is unrenderable, so a bad code can never crash an RSC render. */
export function formatMoney(minorUnits: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const major = minorUnits / 10 ** digits;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

/** Convert a user-entered MAJOR-unit amount (e.g. "1500.00") to integer minor units for storage. */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyFractionDigits(currency));
}
