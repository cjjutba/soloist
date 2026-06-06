import { resolveBrandingVars } from "@/server/branding/branding-vars";
import { getBranding } from "@/server/db/repositories/branding.repository";
import {
  findInvitationByTokenHash,
  isInvitationAcceptable,
} from "@/server/db/repositories/invitations.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { hashToken } from "@/server/invitations/token";
import { AcceptForm } from "./accept-form";

// Pre-auth invite accept (Story 2.4). The raw token in the URL IS the credential — this
// route is intentionally PUBLIC (outside every guard). We hash it, look the invitation up,
// and render either the branded set-password form or a neutral "ask for a new link" state
// (no account/email detail leaked on the invalid path — AC-2). `isInvitationAcceptable`
// (shared with the accept flow) keeps the impure Date.now() out of the component body too.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitationByTokenHash(hashToken(token));

  if (!isInvitationAcceptable(inv)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Invitation</p>
        <h1 className="text-center font-display text-3xl">This link isn&rsquo;t valid</h1>
        <p className="max-w-sm text-center text-muted-foreground">
          This invite link has expired or already been used. Ask for a fresh one.
        </p>
      </main>
    );
  }

  // Valid → brand the screen with the inviting Tenant (a Client-facing surface, so the
  // accent is correct here). Scoped reads using the INVITATION-DERIVED tenant (trusted; the
  // role only satisfies the type — getTenant/getBranding don't branch on it).
  const ctx = { tenantId: inv.tenantId, userId: "invite-preauth", role: "freelancer" as const };
  const [tenant, branding] = await Promise.all([getTenant(ctx), getBranding(ctx)]);
  const vars = resolveBrandingVars(branding, tenant?.name ?? "Your project");
  const tenantName = tenant?.name ?? "Your project";

  return (
    <main
      style={vars.style}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        {vars.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Tenant logo from Blob; matches branding-form
          <img src={vars.logoUrl} alt={tenantName} className="h-12 w-auto max-w-[200px] object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tenant-accent)] font-display text-xl text-[var(--tenant-accent-foreground)]">
            {vars.monogram}
          </div>
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-3xl">You&rsquo;re invited</h1>
          <p className="text-muted-foreground">Set a password to enter {tenantName}&rsquo;s portal.</p>
        </div>
        <AcceptForm token={token} />
      </div>
    </main>
  );
}
