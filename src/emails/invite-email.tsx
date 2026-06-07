import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailShell } from "./email-shell";

export type InviteEmailProps = {
  inviteUrl: string;
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
};

/**
 * Branded client-invite email (Story 2.3, polished in 4.3). Renders through the shared `EmailShell`
 * (logo + accent bar) — a Client-facing surface, so the Tenant accent/logo are correct here.
 * Email-a11y (EXPERIENCE.md L75): logo `alt` / tenant-name fallback, inline colors, semantic
 * heading, ≥14px body.
 */
export function InviteEmail({ inviteUrl, tenantName, logoUrl, accentHex }: InviteEmailProps) {
  return (
    <EmailShell
      tenantName={tenantName}
      logoUrl={logoUrl}
      accentHex={accentHex}
      preview={`${tenantName} invited you to your client portal`}
    >
      <Heading style={{ fontSize: 24, color: "#1c1b1f", marginTop: 0, marginBottom: 8 }}>
        You&rsquo;re invited
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: "24px", color: "#52525b", marginTop: 0 }}>
        {tenantName} set up a private portal for your project. Set your password to see live progress
        as it ships.
      </Text>
      <Section style={{ marginTop: 24, marginBottom: 24 }}>
        <Button
          href={inviteUrl}
          style={{ backgroundColor: accentHex, color: "#ffffff", borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 600, textDecoration: "none" }}
        >
          Accept invitation
        </Button>
      </Section>
      <Text style={{ fontSize: 14, lineHeight: "22px", color: "#71717a", margin: 0 }}>
        Or paste this link into your browser:
        <br />
        {inviteUrl}
      </Text>
      <Hr style={{ borderColor: "#e7e5e0", marginTop: 24, marginBottom: 16 }} />
      <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        This link expires in 7 days. If you weren&rsquo;t expecting this, you can ignore it.
      </Text>
    </EmailShell>
  );
}

export default InviteEmail;
