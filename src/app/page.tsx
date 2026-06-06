import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";

// Public landing at `/` — also the post-login ROLE ROUTER: a signed-in Freelancer goes to
// their Cockpit, a signed-in Client to their Portal (so ONE /login serves both roles, and a
// returning user from anywhere lands on the right surface).
export default async function LandingPage() {
  const session = await getAppSession();
  if (session?.role === "freelancer") redirect("/app");
  if (session?.role === "client") redirect("/portal");

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
      <div className="mt-2 flex flex-col items-center gap-3">
        <Link
          href="/signup"
          className="rounded-[var(--radius-md)] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Create your workspace →
        </Link>
        <p className="text-sm text-muted-foreground">
          Already invited, or have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
