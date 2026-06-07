import type { ReactNode } from "react";
import { Body, Container, Head, Html, Img, Preview, Section, Text } from "@react-email/components";

export type EmailShellProps = {
  tenantName: string;
  logoUrl: string | null;
  accentHex: string;
  preview: string;
  children: ReactNode;
};

/**
 * The shared BRANDED email chrome (Story 4.3) — the Soloist craft (spacing, calm, restraint) as the
 * substrate onto which a Tenant paints a logo + accent, so the result reads as "this person's own
 * product." Both the ship-published (3.6) and invite (2.3) emails render through this.
 *
 * Email-a11y (EXPERIENCE.md L75): the accent brand bar is a 4px top BORDER on the card (an explicit
 * inline color dark-mode clients invert less) — NOT a thin spacer row, because email clients
 * (notably Outlook/MSO) ignore a table's CSS `height` and would collapse the spacer to 0px, making
 * the accent vanish; a border is honored everywhere. The Tenant logo carries `alt="{Tenant name}"`
 * (the only naming in the header → it names the Tenant) with a tenant-name TEXT fallback when there's
 * no logo (so it survives images-off); semantic structure; all colors inline (clients strip `<style>`).
 */
export function EmailShell({ tenantName, logoUrl, accentHex, preview, children }: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#faf9f7", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e0", borderTop: `4px solid ${accentHex}`, borderRadius: 12, maxWidth: 480, margin: "0 auto", overflow: "hidden" }}>
          {/* Logo header — alt names the Tenant; no logo → the tenant name as text (images-off safe). */}
          <Section style={{ padding: "24px 32px 0" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={tenantName} height={32} style={{ height: 32, width: "auto", objectFit: "contain" }} />
            ) : (
              <Text style={{ fontSize: 18, fontWeight: 700, color: "#1c1b1f", margin: 0 }}>{tenantName}</Text>
            )}
          </Section>
          <Section style={{ padding: "16px 32px 32px" }}>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}
