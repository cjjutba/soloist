import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { ShipPublishedEmail } from "@/emails/ship-published-email";

const base = {
  statusEmoji: "✅",
  statusLabel: "Shipped",
  statusBg: "#ECFDF3",
  statusFg: "#15803D",
  title: "Made sign-in faster and more reliable",
  summary: "Auth is quicker now.",
  clientDisplayName: "Maya",
  tenantName: "Alpha Studio",
  logoUrl: "https://blob.example/logo.png",
  accentHex: "#5b5bd6",
  portalUrl: "https://soloist.cjjutba.com/portal",
};

describe("Story 3.6 — ship-published email template", () => {
  it("renders title, status LABEL (not just emoji), accent, portal link, and logo alt", async () => {
    const html = await render(createElement(ShipPublishedEmail, base));
    expect(html).toContain("Made sign-in faster and more reliable");
    expect(html).toContain("Shipped"); // text label — survives images-off (a11y)
    expect(html).toContain("#5b5bd6"); // accent button
    expect(html).toContain("https://soloist.cjjutba.com/portal");
    expect(html).toContain("logo.png"); // the logo image
    expect(html).toContain('alt="Alpha Studio"'); // logo alt
  });

  it("falls back to the tenant-name text when there is no logo", async () => {
    const html = await render(createElement(ShipPublishedEmail, { ...base, logoUrl: null }));
    expect(html).not.toContain("logo.png");
    expect(html).not.toContain("<img"); // no logo image element
    expect(html).toContain("Alpha Studio"); // text fallback
  });

  it("omits the summary block when summary is null", async () => {
    const html = await render(createElement(ShipPublishedEmail, { ...base, summary: null }));
    expect(html).toContain(base.title);
    expect(html).not.toContain("Auth is quicker now.");
  });
});
