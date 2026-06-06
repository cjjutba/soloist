"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeOnboardingAction } from "@/server/portal/onboarding.actions";

/** The single "Got it" CTA on the Onboarding hero (Story 2.5). Stamps the server-side flag
 * then lands on the feed. Inherits the re-scoped `--primary` (= Tenant accent) from the
 * portal layout, so it wears the brand. */
export function OnboardingCta() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await completeOnboardingAction();
      if (res.ok) {
        router.push("/portal");
        router.refresh();
        return;
      }
      toast.error("Something went wrong. Please try again.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={onClick} loading={busy} size="lg" className="min-h-11">
      Got it — show me
    </Button>
  );
}
