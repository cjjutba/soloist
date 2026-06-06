import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a client-invite token (Story 2.3). ≥256 bits of entropy, URL-safe (`base64url`,
 * ~43 chars). The RAW token goes only into the emailed `…/invite/<token>` URL; we persist
 * ONLY its hash (see `hashToken`) — at rest it's an account-takeover credential (NFR-3).
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a token → 64-char hex. Deterministic: the accept flow (Story 2.4) hashes the
 * presented token and looks the invitation up by this `token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
