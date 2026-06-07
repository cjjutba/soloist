import { createElement } from "react";
import { render } from "@react-email/components";
import { Text } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { EmailShell } from "../email-shell";

const base = {
  tenantName: "Alpha Studio",
  accentHex: "#5b5bd6",
  preview: "A preview line",
  children: createElement(Text, null, "the body"),
};

describe("Story 4.3 — EmailShell (shared branded chrome)", () => {
  it("with a logo: renders the <img> with alt=tenantName + the accent brand bar + the preview", async () => {
    const html = await render(createElement(EmailShell, { ...base, logoUrl: "https://blob/logo.png" }));
    expect(html).toContain("logo.png");
    expect(html).toContain('alt="Alpha Studio"');
    expect(html).toContain("#5b5bd6"); // the accent bar
    expect(html).toContain("the body");
    expect(html).toContain("A preview line");
  });

  it("without a logo: falls back to the tenant-name text (images-off safe), no <img>", async () => {
    const html = await render(createElement(EmailShell, { ...base, logoUrl: null }));
    expect(html).not.toContain("<img");
    expect(html).toContain("Alpha Studio"); // text fallback names the Tenant
    expect(html).toContain("#5b5bd6"); // accent bar still present
  });
});
