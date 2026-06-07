import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailShell } from "./email-shell";

export type ShipPublishedEmailProps = {
  statusEmoji: string;
  statusLabel: string;
  statusBg: string;
  statusFg: string;
  title: string;
  summary: string | null;
  clientDisplayName: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
  portalUrl: string;
};

/**
 * Branded "new update" email (Story 3.6, polished in 4.3). Renders through the shared `EmailShell`
 * (logo + accent bar). A11y (EXPERIENCE.md L75): status as **emoji + text label** (not color-only —
 * survives images-off), inline colors (dark-mode), semantic heading, ≥14px body.
 */
export function ShipPublishedEmail({
  statusEmoji,
  statusLabel,
  statusBg,
  statusFg,
  title,
  summary,
  clientDisplayName,
  tenantName,
  logoUrl,
  accentHex,
  portalUrl,
}: ShipPublishedEmailProps) {
  return (
    <EmailShell tenantName={tenantName} logoUrl={logoUrl} accentHex={accentHex} preview={`${statusLabel}: ${title}`}>
      <Heading style={{ fontSize: 22, color: "#1c1b1f", marginTop: 0, marginBottom: 8 }}>
        New progress on your project
      </Heading>
      <Text style={{ fontSize: 14, lineHeight: "22px", color: "#52525b", marginTop: 0, marginBottom: 20 }}>
        Hi {clientDisplayName}, {tenantName} just shipped an update.
      </Text>
      {/* Status — emoji + TEXT label (never color-only), in a tinted pill. */}
      <Section style={{ marginBottom: 12 }}>
        <Text
          style={{
            display: "inline-block",
            backgroundColor: statusBg,
            color: statusFg,
            fontSize: 14,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 999,
            margin: 0,
          }}
        >
          {statusEmoji} {statusLabel}
        </Text>
      </Section>
      <Text style={{ fontSize: 16, fontWeight: 700, color: "#1c1b1f", marginTop: 0, marginBottom: summary ? 4 : 20 }}>
        {title}
      </Text>
      {summary ? (
        <Text style={{ fontSize: 14, lineHeight: "22px", color: "#52525b", marginTop: 0, marginBottom: 20 }}>
          {summary}
        </Text>
      ) : null}
      <Section style={{ marginTop: 8, marginBottom: 24 }}>
        <Button
          href={portalUrl}
          style={{ backgroundColor: accentHex, color: "#ffffff", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
        >
          View in your portal
        </Button>
      </Section>
      <Hr style={{ borderColor: "#e7e5e0", marginTop: 8, marginBottom: 16 }} />
      <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        You&rsquo;re receiving this because {tenantName} shares progress with you on your client portal.
      </Text>
    </EmailShell>
  );
}

export default ShipPublishedEmail;
