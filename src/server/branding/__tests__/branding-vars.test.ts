import { describe, expect, it } from "vitest";
import { resolveBrandingVars } from "../branding-vars";

describe("resolveBrandingVars", () => {
  it("falls back to Soloist Iris + a Tenant-initial monogram when there's no branding", () => {
    const v = resolveBrandingVars(null, "Casey Studio");
    expect(v.style["--tenant-accent"]).toBe("#5B5BD6");
    expect(v.style["--tenant-accent-foreground"]).toBe("#FFFFFF");
    expect(v.monogram).toBe("C");
    expect(v.logoUrl).toBeNull();
    expect(v.focusRingFallback).toBe(false);
    expect(v.style["--tenant-accent-ring"]).toBe("#5B5BD6");
  });

  it("uses the saved accent, text token, and logo", () => {
    const v = resolveBrandingVars(
      { accentHex: "#0F766E", accentTextHex: "#0F766E", logoBlobUrl: "https://blob/x.png" },
      "Teal Co",
    );
    expect(v.style["--tenant-accent"]).toBe("#0F766E");
    expect(v.style["--tenant-accent-text"]).toBe("#0F766E");
    expect(v.style["--tenant-accent-ring"]).toBe("#0F766E"); // passes non-text → ring = accent
    expect(v.logoUrl).toBe("https://blob/x.png");
  });

  it("flips the focus ring to Soloist Ink when the accent fails non-text contrast", () => {
    const v = resolveBrandingVars(
      { accentHex: "#FDE68A", accentTextHex: "#000000", logoBlobUrl: null },
      "Pale Inc",
    );
    expect(v.focusRingFallback).toBe(true);
    expect(v.style["--tenant-accent-ring"]).toBe("#1C1B1F");
  });

  it("handles an empty Tenant name without crashing", () => {
    expect(resolveBrandingVars(null, "   ").monogram).toBe("?");
  });
});
