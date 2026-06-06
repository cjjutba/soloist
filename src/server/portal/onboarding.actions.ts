"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/server/auth/session";
import { markOnboarded } from "@/server/db/repositories/client-access.repository";

export type CompleteOnboardingResult = { ok: true } | { ok: false };

/** Complete the one-time Client Onboarding (Story 2.5): stamp the server-side flag, then the
 * client navigates to the feed. RLS-scoped via the client ctx; idempotent (the repo no-ops
 * if already onboarded). Never throws to the client. */
export async function completeOnboardingAction(): Promise<CompleteOnboardingResult> {
  const ctx = await requireClient();
  try {
    await markOnboarded(ctx);
    revalidatePath("/portal");
    return { ok: true };
  } catch (err) {
    console.error("[onboarding] completeOnboardingAction failed:", err);
    return { ok: false };
  }
}
