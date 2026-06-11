import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailShell } from "./email-shell";
import { SOLOIST_EMAIL_BRAND } from "./soloist-brand";

export type VerifyEmailProps = {
  verifyUrl: string;
  userName?: string;
};

/**
 * Branded email-verification email (Story 1.3, now polished). A Soloist PLATFORM email — rendered
 * through the shared `EmailShell` with Soloist Iris + the "Soloist" wordmark (no Tenant context at
 * sign-up). Same shape as the reset email so the two platform emails are consistent. Email-a11y
 * (EXPERIENCE.md L75): inline colors, one semantic heading, the link as BOTH a button and
 * pasteable text, body ≥14px.
 */
export function VerifyEmail({ verifyUrl, userName }: VerifyEmailProps) {
  return (
    <EmailShell
      tenantName={SOLOIST_EMAIL_BRAND.name}
      logoUrl={SOLOIST_EMAIL_BRAND.logoUrl}
      accentHex={SOLOIST_EMAIL_BRAND.accentHex}
      preview="Verify your email for Soloist"
    >
      <Heading style={{ fontSize: 24, color: "#1c1b1f", marginTop: 0, marginBottom: 8 }}>
        Verify your email
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: "24px", color: "#52525b", marginTop: 0 }}>
        Welcome to Soloist{userName ? `, ${userName}` : ""}. Confirm your email to activate your
        workspace.
      </Text>
      <Section style={{ marginTop: 24, marginBottom: 24 }}>
        <Button
          href={verifyUrl}
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
          Verify email
        </Button>
      </Section>
      <Text style={{ fontSize: 14, lineHeight: "22px", color: "#71717a", margin: 0 }}>
        Or paste this link into your browser:
        <br />
        {verifyUrl}
      </Text>
      <Hr style={{ borderColor: "#e7e5e0", marginTop: 24, marginBottom: 16 }} />
      <Text style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
        This link expires in 1 hour. If you didn&rsquo;t create a Soloist account, you can ignore
        this email.
      </Text>
    </EmailShell>
  );
}

export default VerifyEmail;
