import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailShell } from "./email-shell";

export type InvoiceSentEmailProps = {
  number: number;
  amount: string; // pre-formatted via formatMoney (integer minor units → localized string)
  dueLabel: string | null; // YYYY-MM-DD or null
  clientDisplayName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
  invoiceUrl: string;
};

/**
 * Branded "new invoice" email (Story 5.2). Renders through the shared `EmailShell` (logo + accent
 * bar) — the same chrome as the ship-published + invite emails. A11y (EXPERIENCE.md L75): the amount
 * is TEXT (not an image), inline colors (dark-mode), a semantic heading, ≥14px body, a real button.
 * The amount is pre-formatted by the sender via `formatMoney` (no money math in the template).
 */
export function InvoiceSentEmail({
  number,
  amount,
  dueLabel,
  clientDisplayName,
  tenantName,
  logoUrl,
  accentHex,
  invoiceUrl,
}: InvoiceSentEmailProps) {
  return (
    <EmailShell tenantName={tenantName} logoUrl={logoUrl} accentHex={accentHex} preview={`Invoice #${number}: ${amount}`}>
      <Heading style={{ fontSize: 22, color: "#1c1b1f", marginTop: 0, marginBottom: 8 }}>
        You have a new invoice
      </Heading>
      <Text style={{ fontSize: 14, lineHeight: "22px", color: "#52525b", marginTop: 0, marginBottom: 20 }}>
        Hi {clientDisplayName}, {tenantName} sent you an invoice.
      </Text>
      {/* The invoice summary — number + total as TEXT (survives images-off). */}
      <Section style={{ backgroundColor: "#faf9f7", border: "1px solid #e7e5e0", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <Text style={{ fontSize: 13, color: "#71717a", margin: 0, marginBottom: 4 }}>Invoice #{number}</Text>
        <Text style={{ fontSize: 24, fontWeight: 700, color: "#1c1b1f", margin: 0 }}>{amount}</Text>
        {dueLabel ? (
          <Text style={{ fontSize: 13, color: "#71717a", margin: 0, marginTop: 8 }}>Due {dueLabel}</Text>
        ) : null}
      </Section>
      <Section style={{ marginTop: 8, marginBottom: 24 }}>
        <Button
          href={invoiceUrl}
          style={{ backgroundColor: accentHex, color: "#ffffff", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
        >
          View invoice
        </Button>
      </Section>
      <Hr style={{ borderColor: "#e7e5e0", marginTop: 8, marginBottom: 16 }} />
      <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        You&rsquo;re receiving this because {tenantName} sent you an invoice on your client portal.
      </Text>
    </EmailShell>
  );
}

export default InvoiceSentEmail;
