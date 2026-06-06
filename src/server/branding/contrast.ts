/**
 * The Branding contrast guard (Story 1.6 / DESIGN.md UX-DR4). Pure WCAG math — no I/O,
 * no React — so it runs identically in the client picker and the authoritative server
 * action. The Tenant accent is used three ways; the guard validates all three:
 *   - fill:     white on the accent ≥ 4.5  (HARD block — the brand fill can't be silently changed)
 *   - text:     the accent AS text on Paper AND white ≥ 4.5  (auto-darkened — decoupled token)
 *   - non-text: the accent on Paper ≥ 3.0   (else the focus ring falls back to Soloist Ink)
 */

export const WHITE = "#FFFFFF";
export const PAPER = "#FBFAF8"; // --background
export const INK = "#1C1B1F"; // --foreground (focus-ring fallback)
export const DEFAULT_ACCENT = "#5B5BD6"; // Soloist Iris — neutral pre-customization default
export const HEX_RE = /^#[0-9a-fA-F]{6}$/; // the one canonical accent-color shape

type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Normalize any #rgb/#rrggbb-ish input to #RRGGBB uppercase. */
export function normalizeHex(hex: string): string {
  return rgbToHex(hexToRgb(hex));
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Scale RGB toward black by factor f (0..1) — monotonically reduces luminance, keeps hue. */
function scaleTowardBlack(hex: string, f: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * f, g: g * f, b: b * f });
}

/** Darken `hex` toward black until `passes(shade)` holds; returns the lightest passing shade. */
function findPassingShade(hex: string, passes: (shade: string) => boolean): string {
  const start = normalizeHex(hex);
  if (passes(start)) return start;
  for (let f = 0.98; f >= 0; f -= 0.02) {
    const shade = scaleTowardBlack(hex, f);
    if (passes(shade)) return shade;
  }
  return "#000000";
}

/** Nearest (darker) shade of `hex` where white-on-it ≥ 4.5 — used as the block suggestion. */
export function nearestPassingFill(hex: string): string {
  return findPassingShade(hex, (s) => contrastRatio(WHITE, s) >= 4.5);
}

/** The decoupled text token: the accent darkened until it's legible as text on Paper AND white. */
export function deriveAccentText(hex: string): string {
  return findPassingShade(
    hex,
    (s) => contrastRatio(s, PAPER) >= 4.5 && contrastRatio(s, WHITE) >= 4.5,
  );
}

export type GuardResult =
  | { ok: true; accentHex: string; accentTextHex: string; focusRingFallback: boolean }
  | { ok: false; error: string; suggestion: string };

/** Validate a chosen accent. Only the fill check blocks; text auto-darkens, non-text
 * falls back to Ink. On block, returns the nearest darker passing shade. */
export function guardAccent(input: string): GuardResult {
  // Defensive: malformed input would otherwise propagate as NaN luminance (garbage shade)
  // rather than a clear rejection. The save path also Zod-validates, but the exported
  // helpers must be safe for any caller.
  if (!HEX_RE.test(input)) {
    return { ok: false, error: "Use a 6-digit hex color like #5B5BD6.", suggestion: DEFAULT_ACCENT };
  }
  const accentHex = normalizeHex(input);
  const fill = contrastRatio(WHITE, accentHex);
  if (fill < 4.5) {
    const suggestion = nearestPassingFill(accentHex);
    return {
      ok: false,
      error: `This accent is too light — white text on it scores ${fill.toFixed(2)}:1 (needs 4.5:1). Nearest readable shade: ${suggestion}.`,
      suggestion,
    };
  }
  return {
    ok: true,
    accentHex,
    accentTextHex: deriveAccentText(accentHex),
    focusRingFallback: contrastRatio(accentHex, PAPER) < 3.0,
  };
}
