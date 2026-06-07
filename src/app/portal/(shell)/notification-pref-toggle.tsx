"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setNotificationPrefAction } from "@/server/portal/notifications.actions";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The Client's global notification on/off switch (Story 4.4). A `role="switch"` button (NOT a
 * checkbox-in-a-menu) with a ≥44px hit area + visible focus ring. **Optimistic**: it flips local
 * state immediately, calls the action, and reverts (with a toast) only on failure. The track
 * transition is `motion-safe` (instant under reduced-motion), consistent with the 4.2 toast.
 */
export function NotificationPrefToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setPending(true);
    try {
      const res = await setNotificationPrefAction({ enabled: next });
      if (!res.ok) throw new Error("not ok");
    } catch {
      setEnabled(!next); // revert
      toast.error("Couldn't update your preference. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Notify me when something ships</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn this off to stop emails and in-app alerts. Your updates still appear in your feed.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-busy={pending}
        aria-label="Notify me when something ships"
        onClick={() => void toggle()}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full",
          FOCUS_RING,
        )}
      >
        {/* The visual track (44×24); the hit area is the ≥44px button around it. */}
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
            enabled ? "border-primary bg-primary" : "border-border bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-background shadow-sm motion-safe:transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-[2px]",
            )}
          />
        </span>
      </button>
    </div>
  );
}
