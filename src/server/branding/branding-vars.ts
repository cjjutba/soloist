import { contrastRatio, DEFAULT_ACCENT, HEX_RE, INK, PAPER } from "./contrast";

const ACCENT_FOREGROUND = "#FFFFFF"; // white text on the accent fill

const validHex = (v: string | null | undefined): v is string => !!v && HEX_RE.test(v);

/** Structural shape of the persisted Branding row (avoids importing the db schema type
 * into the feature layer, which the ESLint guard forbids). */
export type BrandingLike = {
  accentHex: string | null;
  accentTextHex: string | null;
  logoBlobUrl: string | null;
};

export type BrandingVars = {
  /** Inline CSS custom properties to apply on a Client-facing surface root. */
  style: Record<string, string>;
  focusRingFallback: boolean;
  /** Tenant-initial fallback when there's no logo. */
  monogram: string;
  logoUrl: string | null;
};

/**
 * Resolve a Tenant's Branding into the runtime `--tenant-accent*` CSS variables — the one
 * place that maps stored branding → tokens. Used by the Cockpit "how the Client sees it"
 * preview now, and by the Client Portal layout + branded emails in Epic 2 / Epic 4.
 * Falls back to Soloist Iris + a Tenant-initial monogram until customized (UX-DR3).
 */
export function resolveBrandingVars(
  branding: BrandingLike | null,
  tenantName: string,
): BrandingVars {
  // Guard malformed/garbage stored values so we never emit NaN-driven CSS vars.
  const accent = validHex(branding?.accentHex) ? branding.accentHex : DEFAULT_ACCENT;
  // The text token is stored already-darkened (guardAccent); fall back to the accent itself.
  const accentText = validHex(branding?.accentTextHex) ? branding.accentTextHex : accent;
  // Non-text guard: if the accent is too low-contrast on Paper for a focus ring, use Ink.
  const focusRingFallback = contrastRatio(accent, PAPER) < 3.0;

  return {
    style: {
      "--tenant-accent": accent,
      "--tenant-accent-foreground": ACCENT_FOREGROUND,
      "--tenant-accent-text": accentText,
      "--tenant-accent-ring": focusRingFallback ? INK : accent,
    },
    focusRingFallback,
    monogram: (tenantName.trim()[0] ?? "?").toUpperCase(),
    logoUrl: branding?.logoBlobUrl ?? null,
  };
}
