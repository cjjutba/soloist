"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/auth/client";
import { NotificationBell } from "./notification-bell";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The minimal, mobile-first Client Portal nav (Story 2.6): Updates · Documents · a bell ·
 * an avatar menu. Two destinations max + the bell + the avatar — no dashboards, no tabs.
 * Every control has a ≥44px hit area (`min-h-11`/`min-w-11`) + a visible focus ring. The
 * avatar wears the re-scoped `--primary` (Tenant accent) from the portal root. */
export function PortalNav({ clientName, clientEmail }: { clientName: string; clientEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initial = (clientName.trim()[0] || clientEmail.trim()[0] || "?").toUpperCase();

  // Close the avatar menu on Escape, returning focus to the trigger (a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function onLogout() {
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("Couldn't sign out. Please try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  function navLink(href: string, label: string) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center rounded-[var(--radius-md)] px-2 text-sm transition-colors",
          FOCUS_RING,
          active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav aria-label="Portal" className="flex items-center gap-0.5">
      {navLink("/portal", "Updates")}
      {navLink("/portal/documents", "Documents")}
      <NotificationBell />

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label="Account menu"
          className={cn(
            "flex min-h-11 min-w-11 items-center justify-center rounded-full",
            FOCUS_RING,
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initial}
          </span>
        </button>
        {open ? (
          <>
            {/* Transparent backdrop — closes the menu on an outside tap. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              aria-label="Account"
              className="absolute right-0 top-full z-20 mt-1 w-56 rounded-[var(--radius-md)] border border-border bg-card p-1 shadow-md"
            >
              <p className="truncate px-3 py-2 text-xs text-muted-foreground">{clientEmail}</p>
              <Link
                href="/portal/settings"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm text-foreground transition-colors hover:bg-muted",
                  FOCUS_RING,
                )}
              >
                <Settings className="size-4" aria-hidden />
                Settings
              </Link>
              <button
                type="button"
                onClick={onLogout}
                disabled={signingOut}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                {signingOut ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <LogOut className="size-4" aria-hidden />
                )}
                {signingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </nav>
  );
}
