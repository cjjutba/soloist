import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { ResetPasswordEmail } from "../reset-password-email";

const resetUrl = "https://soloist.cjjutba.com/reset-password?token=tok_abc";

// React renders adjacent text nodes separated by invisible `<!-- -->` markers; strip them so
// assertions match the human-visible text.
const visible = (html: string) => html.replace(/<!--\s*-->/g, "");

describe("reset-password email (branded, through the shell)", () => {
  it("renders the reset URL as both a CTA button and a paste-link, with Soloist Iris accent", async () => {
    const html = await render(createElement(ResetPasswordEmail, { resetUrl, userName: "CJ" }));
    const text = visible(html);

    expect(html).toContain(resetUrl); // link present (button href + paste fallback)
    expect(html).toContain("Reset password"); // CTA text (images-off safe)
    expect(html).toContain("#5b5bd6"); // Soloist Iris (accent bar + button)
    expect(html).toContain("Reset your password"); // heading
    expect(text).toContain("Hi CJ, we"); // personalized greeting
    expect(text).toContain("1 hour"); // expiry fine print
  });

  it("is a Soloist platform email — wordmark, not a tenant logo image", async () => {
    const html = await render(createElement(ResetPasswordEmail, { resetUrl }));
    const text = visible(html);

    expect(html).not.toContain("<img"); // no logo image (text wordmark fallback)
    expect(html).toContain("Soloist"); // the wordmark
    expect(text).toContain("We received a request"); // non-personalized copy when no name
  });
});
