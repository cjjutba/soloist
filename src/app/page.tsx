import Link from "next/link";

// Public landing at `/`. (A fuller marketing page / auth entry comes later;
// for the walking skeleton it brands the product and links into the Cockpit.)
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Soloist
      </p>
      <h1 className="text-center font-display text-4xl">
        Run solo. Deliver like an agency.
      </h1>
      <p className="max-w-md text-center text-muted-foreground">
        A dev-native client portal. Your clients watch real progress ship — in plain
        English, under your brand.
      </p>
      <Link
        href="/app"
        className="mt-2 rounded-[var(--radius-md)] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Open the Cockpit →
      </Link>
    </main>
  );
}
