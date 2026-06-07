import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InviteEmail } from "../invite-email";

const base = {
  inviteUrl: "https://soloist.cjjutba.com/invite/the-token",
  tenantName: "Alpha Studio",
  accentHex: "#5b5bd6",
};

describe("Story 4.3 — invite email (polished, through the shell)", () => {
  it("renders the invite URL (CTA + paste-link), accent, logo alt, and the CTA text", async () => {
    const html = await render(createElement(InviteEmail, { ...base, logoUrl: "https://blob/logo.png" }));
    expect(html).toContain("https://soloist.cjjutba.com/invite/the-token"); // the link (CTA + paste)
    expect(html).toContain("Accept invitation"); // the CTA text (images-off safe)
    expect(html).toContain("#5b5bd6"); // accent (bar + button)
    expect(html).toContain('alt="Alpha Studio"'); // logo alt
    expect(html).toContain("You"); // the "You're invited" heading
  });

  it("with no logo: the tenant name carries the brand (images-off), no <img>", async () => {
    const html = await render(createElement(InviteEmail, { ...base, logoUrl: null }));
    expect(html).not.toContain("<img");
    expect(html).toContain("Alpha Studio");
    expect(html).toContain("Accept invitation");
  });
});
