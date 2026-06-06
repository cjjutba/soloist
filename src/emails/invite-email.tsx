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

export type InviteEmailProps = {
  inviteUrl: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
};

/**
 * Basic BRANDED client-invite email (Story 2.3). Carries the freelancer's logo + accent —
 * this is a Client-facing surface, so the Tenant accent is correct here (unlike the
 * Cockpit). Epic 4.3 replaces this with the polished, a11y-audited template system.
 */
export function InviteEmail({ inviteUrl, tenantName, logoUrl, accentHex }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${tenantName} invited you to your client portal`}</Preview>
      <Body style={{ backgroundColor: "#faf9f7", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e0", borderRadius: 12, maxWidth: 480, margin: "0 auto", padding: 32 }}>
          <Section>
            {logoUrl ? (
              <Img src={logoUrl} alt={tenantName} height={40} style={{ height: 40, width: "auto", objectFit: "contain" }} />
            ) : (
              <Text style={{ fontSize: 18, fontWeight: 700, color: "#1c1b1f", margin: 0 }}>{tenantName}</Text>
            )}
          </Section>
          <Heading style={{ fontSize: 24, color: "#1c1b1f", marginTop: 24, marginBottom: 8 }}>
            You&rsquo;re invited
          </Heading>
          <Text style={{ fontSize: 15, lineHeight: "24px", color: "#52525b", marginTop: 0 }}>
            {tenantName} set up a private portal for your project. Set your password to see live
            progress as it ships.
          </Text>
          <Section style={{ marginTop: 24, marginBottom: 24 }}>
            <Button
              href={inviteUrl}
              style={{ backgroundColor: accentHex, color: "#ffffff", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
            >
              Accept invitation
            </Button>
          </Section>
          <Text style={{ fontSize: 13, lineHeight: "20px", color: "#71717a", margin: 0 }}>
            Or paste this link into your browser:
            <br />
            {inviteUrl}
          </Text>
          <Hr style={{ borderColor: "#e7e5e0", marginTop: 24, marginBottom: 16 }} />
          <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
            This link expires in 7 days. If you weren&rsquo;t expecting this, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;
