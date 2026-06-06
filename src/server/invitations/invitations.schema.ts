import { z } from "zod";

/** Client email for an invite (Story 2.3). Normalized (trimmed + lowercased) so resend /
 * accept compare cleanly. */
export const inviteEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email.");

/** How long an invite token stays valid. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
