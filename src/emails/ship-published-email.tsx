import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

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
 * Minimal BRANDED "new update" email (Story 3.6). Client-facing → the Tenant accent/logo are
 * correct here. A11y (EXPERIENCE.md L75): logo `alt`, status as **emoji + text label** (not
 * color-only — survives images-off), inline colors (dark-mode clients invert), ≥14px body.
 * Epic 4.3 replaces this with the polished template system.
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
    <Html>
      <Head />
      <Preview>{`${statusLabel}: ${title}`}</Preview>
      <Body style={{ backgroundColor: "#faf9f7", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e0", borderRadius: 12, maxWidth: 480, margin: "0 auto", padding: 32 }}>
          <Section>
            {logoUrl ? (
              <Img src={logoUrl} alt={tenantName} height={40} style={{ height: 40, width: "auto", objectFit: "contain" }} />
            ) : (
              <Text style={{ fontSize: 18, fontWeight: 700, color: "#1c1b1f", margin: 0 }}>{tenantName}</Text>
            )}
          </Section>
          <Heading style={{ fontSize: 22, color: "#1c1b1f", marginTop: 24, marginBottom: 8 }}>
            New progress on your project
          </Heading>
          <Text style={{ fontSize: 14, lineHeight: "22px", color: "#52525b", marginTop: 0, marginBottom: 20 }}>
            Hi {clientDisplayName}, {tenantName} just shipped an update.
          </Text>
          {/* Status — emoji + TEXT label (never color-only), with a tinted pill. */}
          <Section style={{ marginBottom: 12 }}>
            <Text
              style={{
                display: "inline-block",
                backgroundColor: statusBg,
                color: statusFg,
                fontSize: 13,
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
            You&rsquo;re receiving this because {tenantName} shares progress with you on your client
            portal.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ShipPublishedEmail;
