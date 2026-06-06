import type { ReactNode } from "react";
import { requireFreelancer } from "@/server/auth/session";
import { LogoutButton } from "./logout-button";

// Cockpit surface (Soloist-branded), served at /app/*. The role guard runs here on
// every server render of this subtree: unauthenticated → /login, non-freelancer →
// not-found. The freelancer's Tenant is resolved from the session (never the host/URL).
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireFreelancer();
  return (
    <div data-surface="cockpit" className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Soloist · Cockpit
        </span>
        <LogoutButton />
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
