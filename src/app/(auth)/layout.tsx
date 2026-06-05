import Link from "next/link";
import type { ReactNode } from "react";

// Pre-auth, Soloist-branded shell for /signup (and /login in Story 1.4). Kept
// OUTSIDE /app so the 1.4 role guard (which requires a session for /app/*) never
// locks out the sign-up flow.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background p-6">
      <Link
        href="/"
        className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Soloist
      </Link>
      {children}
    </div>
  );
}
