export default function PortalPage() {
  // Served at /portal/*. The Client's Engagement + Tenant branding are resolved
  // from the authenticated session (Story 1.4 / Epic 2) — no tenant in the URL.
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Client Portal
      </p>
      <h1 className="text-center font-display text-3xl">Your workspace</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Walking skeleton — branded onboarding and the live Ship Feed arrive in Epics&nbsp;2
        &amp; 3. Your freelancer&rsquo;s brand applies here once you&rsquo;re signed in.
      </p>
    </main>
  );
}
