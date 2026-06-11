import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailShell } from "./email-shell";
import { SOLOIST_EMAIL_BRAND } from "./soloist-brand";

export type ResetPasswordEmailProps = {
  resetUrl: string;
  userName?: string;
};

/**
 * Branded password-reset email. A Soloist PLATFORM email (not Tenant-branded) — rendered through
 * the shared `EmailShell` with Soloist Iris + the "Soloist" wordmark. Mirrors the invite email's
 * shape (heading → copy → accent CTA button → paste-link fallback → fine print) so the reset is a
 * real, clickable, on-brand email instead of a bare text line. Email-a11y (EXPERIENCE.md L75):
 * inline colors, one semantic heading, the link present as BOTH a button and pasteable text
 * (survives images-off / button-stripping clients), body ≥14px.
 */
export function ResetPasswordEmail({ resetUrl, userName }: ResetPasswordEmailProps) {
  return (
    <EmailShell
      tenantName={SOLOIST_EMAIL_BRAND.name}
      logoUrl={SOLOIST_EMAIL_BRAND.logoUrl}
      accentHex={SOLOIST_EMAIL_BRAND.accentHex}
      preview="Reset your Soloist password"
    >
      <Heading style={{ fontSize: 24, color: "#1c1b1f", marginTop: 0, marginBottom: 8 }}>
        Reset your password
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: "24px", color: "#52525b", marginTop: 0 }}>
        {userName ? `Hi ${userName}, we` : "We"} received a request to reset the password for your
        Soloist account. Click the button below to choose a new one.
      </Text>
      <Section style={{ marginTop: 24, marginBottom: 24 }}>
        <Button
          href={resetUrl}
          style={{
            backgroundColor: SOLOIST_EMAIL_BRAND.accentHex,
            color: "#ffffff",
            borderRadius: 8,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Reset password
        </Button>
      </Section>
      <Text style={{ fontSize: 14, lineHeight: "22px", color: "#71717a", margin: 0 }}>
        Or paste this link into your browser:
        <br />
        {resetUrl}
      </Text>
      <Hr style={{ borderColor: "#e7e5e0", marginTop: 24, marginBottom: 16 }} />
      <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        This link expires in 1 hour. If you didn&rsquo;t request a reset, you can ignore this email
        &mdash; your password won&rsquo;t change.
      </Text>
    </EmailShell>
  );
}

export default ResetPasswordEmail;
