"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { isUuid } from "@/lib/uuid";
import { requireFreelancer } from "@/server/auth/session";
import { DEFAULT_ACCENT } from "@/server/branding/contrast";
import { getBranding } from "@/server/db/repositories/branding.repository";
import { getEngagement } from "@/server/db/repositories/engagements.repository";
import {
  getInvitationByEngagement,
  upsertInvitation,
} from "@/server/db/repositories/invitations.repository";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { sendInviteEmail } from "./email";
import { INVITE_TTL_MS, inviteEmailSchema } from "./invitations.schema";
import { generateInviteToken, hashToken } from "./token";

export type InviteResult = { ok: true } | { ok: false; error: string };

/** Shared core: generate a fresh token, persist its hash, and send the branded email.
 * The RAW token is used ONLY to build the URL — never persisted, never returned. */
async function issueInvite(
  ctx: Awaited<ReturnType<typeof requireFreelancer>>,
  engagementId: string,
  email: string,
): Promise<InviteResult> {
  // Ownership: getEngagement is RLS-scoped → null means it isn't the caller's Engagement.
  const engagement = await getEngagement(ctx, engagementId);
  if (!engagement) return { ok: false, error: "That engagement no longer exists." };

  // Never let a (re)invite silently un-accept a client or mint a fresh takeover token for
  // an Engagement they've already joined (the UI hides Resend when accepted, but the action
  // is directly callable — this is the authoritative guard).
  const existing = await getInvitationByEngagement(ctx, engagementId);
  if (existing?.acceptedAt) {
    return { ok: false, error: "This client has already accepted their invite." };
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  try {
    const saved = await upsertInvitation(ctx, { engagementId, email, tokenHash: hashToken(token), expiresAt });
    if (!saved) return { ok: false, error: "Couldn't save the invite. Please try again." };

    const [tenant, branding] = await Promise.all([getTenant(ctx), getBranding(ctx)]);
    await sendInviteEmail({
      to: email,
      // Strip any trailing slash so the base never yields `…//invite/…`.
      inviteUrl: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/invite/${token}`,
      tenantName: tenant?.name ?? "Your project",
      logoUrl: branding?.logoBlobUrl ?? null,
      accentHex: branding?.accentHex ?? DEFAULT_ACCENT,
    });
  } catch (err) {
    console.error("[invitations] issueInvite failed:", err);
    return { ok: false, error: "Couldn't send the invite. Please try again." };
  }

  revalidatePath(`/app/engagements/${engagementId}/client`);
  return { ok: true };
}

/** Send a first/replacement invite to a client email (AC-1). */
export async function sendInviteAction(engagementId: string, email: string): Promise<InviteResult> {
  const ctx = await requireFreelancer();
  if (!isUuid(engagementId)) return { ok: false, error: "That engagement no longer exists." };
  const parsed = inviteEmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email." };
  }
  return issueInvite(ctx, engagementId, parsed.data);
}

/** Resend: regenerate the token + expiry and re-send to the already-invited address (AC-2). */
export async function resendInviteAction(engagementId: string): Promise<InviteResult> {
  const ctx = await requireFreelancer();
  if (!isUuid(engagementId)) return { ok: false, error: "There's no invite to resend yet." };
  const existing = await getInvitationByEngagement(ctx, engagementId);
  if (!existing) return { ok: false, error: "There's no invite to resend yet." };
  return issueInvite(ctx, engagementId, existing.email);
}
