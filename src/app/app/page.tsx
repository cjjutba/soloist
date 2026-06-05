export default function CockpitPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-8 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Soloist · Cockpit
      </p>
      <h1 className="text-center font-display text-4xl">Your workspace</h1>
      <p className="max-w-md text-center text-muted-foreground">
        The freelancer back-office. Walking skeleton — engagements, curation, and
        invoices arrive in later stories.
      </p>
    </main>
  );
}
