import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InvoiceSentEmail } from "@/emails/invoice-sent-email";

const base = {
  number: 7,
  amount: "₱1,500.00", // pre-formatted by the sender via formatMoney
  dueLabel: "2026-07-01",
  clientDisplayName: "Maya",
  tenantName: "Alpha Studio",
  logoUrl: "https://blob.example/logo.png",
  accentHex: "#5b5bd6",
  invoiceUrl: "https://soloist.cjjutba.com/portal/documents/inv1",
};

describe("Story 5.2 — invoice-sent email template", () => {
  it("renders the number, formatted amount (text), due date, accent button, invoice link, and logo alt", async () => {
    const html = await render(createElement(InvoiceSentEmail, base));
    expect(html).toContain("#7");
    expect(html).toContain("1,500.00"); // the pre-formatted amount, as TEXT (survives images-off)
    expect(html).toContain("2026-07-01");
    expect(html).toContain("#5b5bd6"); // accent button
    expect(html).toContain("https://soloist.cjjutba.com/portal/documents/inv1");
    expect(html).toContain('alt="Alpha Studio"'); // logo alt names the Tenant
  });

  it("omits the due-date line when dueLabel is null and falls back to the tenant name without a logo", async () => {
    const html = await render(createElement(InvoiceSentEmail, { ...base, dueLabel: null, logoUrl: null }));
    expect(html).not.toContain("Due ");
    expect(html).not.toContain("<img"); // no logo image element
    expect(html).toContain("Alpha Studio"); // text fallback
  });
});
