import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { VerifyEmail } from "../verify-email";

const verifyUrl = "https://soloist.cjjutba.com/api/auth/verify-email?token=tok_xyz";

// React renders adjacent text nodes (e.g. "Welcome to Soloist" + ", CJ") separated by invisible
// `<!-- -->` comment markers; strip them so assertions match the human-visible text.
const visible = (html: string) => html.replace(/<!--\s*-->/g, "");

describe("verify-email (branded, through the shell)", () => {
  it("renders the verify URL as both a CTA button and a paste-link, with Soloist Iris accent", async () => {
    const html = await render(createElement(VerifyEmail, { verifyUrl, userName: "CJ" }));
    const text = visible(html);

    expect(html).toContain(verifyUrl); // link present (button href + paste fallback)
    expect(html).toContain("Verify email"); // CTA text (images-off safe)
    expect(html).toContain("#5b5bd6"); // Soloist Iris accent
    expect(html).toContain("Verify your email"); // heading
    expect(text).toContain("Welcome to Soloist, CJ"); // personalized welcome
  });

  it("is a Soloist platform email — wordmark, not a tenant logo image", async () => {
    const html = await render(createElement(VerifyEmail, { verifyUrl }));
    const text = visible(html);

    expect(html).not.toContain("<img");
    expect(html).toContain("Soloist");
    expect(text).toContain("Welcome to Soloist."); // no trailing name when omitted
  });
});
