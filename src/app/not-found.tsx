// Neutral not-found. Identical for an unknown subdomain and an unauthorized
// resource — existence is never disclosed (NFR-2: not-found, never denied).
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
      <h1 className="font-display text-3xl">Nothing here</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        This address isn&rsquo;t available.
      </p>
    </main>
  );
}
