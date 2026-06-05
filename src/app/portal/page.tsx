import { headers } from "next/headers";

export default async function PortalPage() {
  // Resolved by middleware from the subdomain. No DB lookup yet — Story 1.5 adds
  // the real Tenant-existence check (unknown slug → not-found).
  const slug = (await headers()).get("x-tenant-slug") ?? "unknown";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {slug} · workspace
      </p>
      <h1 className="text-center font-display text-3xl">
        Welcome to {slug}&rsquo;s workspace
      </h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Your client portal. Walking skeleton — the branded onboarding and live Ship
        Feed arrive in Epics&nbsp;2 &amp; 3.
      </p>
    </main>
  );
}
