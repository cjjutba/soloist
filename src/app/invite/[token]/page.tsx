// Pre-auth invite/onboarding entry at /invite/[token]. The token resolves the
// Tenant (for branding) before the Client sets a password — full flow in Epic 2.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Invitation
      </p>
      <h1 className="text-center font-display text-3xl">You&rsquo;re invited</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Walking skeleton — the branded accept &amp; onboarding flow arrives in Epic&nbsp;2.
      </p>
      <p className="font-mono text-xs text-muted-foreground">token: {token.slice(0, 8)}…</p>
    </main>
  );
}
