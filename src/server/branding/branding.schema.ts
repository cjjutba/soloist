import { z } from "zod";
import { HEX_RE } from "./contrast";

/** A 6-digit hex color (#RRGGBB) — same canonical shape as the contrast guard. */
export const accentHexSchema = z
  .string()
  .regex(HEX_RE, "Use a 6-digit hex color like #5B5BD6");

export const saveAccentSchema = z.object({ accentHex: accentHexSchema });
export type SaveAccentInput = z.infer<typeof saveAccentSchema>;

/**
 * Logo upload constraints. **SVG is intentionally excluded** — an SVG is an active
 * document (can carry <script>) and the blob is served public from a shared origin, so
 * a stored SVG is a latent XSS vector. PNG/JPG (transparent PNG covers "transparent
 * preferred"). Revisit SVG only with server-side sanitization + nosniff/CSP.
 */
export const LOGO_MAX_BYTES = 1024 * 1024; // 1MB
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_EXT: Record<(typeof LOGO_MIME_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};
