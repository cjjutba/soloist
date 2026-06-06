"use server";

import { z } from "zod";
import { acceptInvite } from "./accept-invite";

const InputSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Use at least 8 characters."),
});

export type AcceptInviteActionResult = { ok: true } | { ok: false; error: string };

/**
 * /invite accept (Story 2.4). On success, `acceptInvite` has signed the Client in — the
 * `nextCookies` plugin sets the session cookie on this action's response — so the client
 * just navigates to /portal. On failure we return a typed error for inline display: the
 * invalid/expired/unknown cases collapse to ONE neutral message (no disclosure);
 * `email-taken` is the only distinct, actionable one.
 */
export async function acceptInviteAction(input: {
  token: string;
  password: string;
}): Promise<AcceptInviteActionResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const res = await acceptInvite(parsed.data);
  if (res.ok) return { ok: true };

  switch (res.reason) {
    case "email-taken":
      return {
        ok: false,
        error: "This email already has a Soloist account. Ask for an invite to a different address.",
      };
    case "invalid":
      return { ok: false, error: "This invite link is no longer valid. Ask for a fresh one." };
    default:
      return { ok: false, error: "Something went wrong. Please try again." };
  }
}
