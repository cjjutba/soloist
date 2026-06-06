"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { env } from "@/env";
import { requireFreelancer } from "@/server/auth/session";
import { upsertBranding } from "@/server/db/repositories/branding.repository";
import {
  LOGO_EXT,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  saveAccentSchema,
} from "./branding.schema";
import { guardAccent } from "./contrast";

const SETTINGS_PATH = "/app/settings/branding";

export type SaveAccentResult =
  | { ok: true; accentHex: string; accentTextHex: string; focusRingFallback: boolean }
  | { ok: false; error: string; suggestion?: string };

/**
 * Save the Tenant accent (Story 1.6). The contrast guard is re-run SERVER-SIDE here —
 * the authoritative invariant, independent of the client picker (architecture L202).
 */
export async function saveAccent(input: { accentHex: string }): Promise<SaveAccentResult> {
  const ctx = await requireFreelancer();

  const parsed = saveAccentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid hex color." };
  }

  const guard = guardAccent(parsed.data.accentHex);
  if (!guard.ok) {
    return { ok: false, error: guard.error, suggestion: guard.suggestion };
  }

  try {
    await upsertBranding(ctx, {
      accentHex: guard.accentHex,
      accentTextHex: guard.accentTextHex,
    });
  } catch (err) {
    console.error("[branding] saveAccent failed:", err);
    return { ok: false, error: "Couldn't save your accent. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  return {
    ok: true,
    accentHex: guard.accentHex,
    accentTextHex: guard.accentTextHex,
    focusRingFallback: guard.focusRingFallback,
  };
}

export type UploadLogoResult = { ok: true; url: string } | { ok: false; error: string };

/** Upload a Tenant logo to Vercel Blob and save its URL (Story 1.6). */
export async function uploadLogo(formData: FormData): Promise<UploadLogoResult> {
  const ctx = await requireFreelancer();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a logo file to upload." };
  }
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Logo must be a PNG, SVG, or JPG." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo must be 1MB or smaller." };
  }
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, error: "Logo upload isn't configured yet (no Vercel Blob store)." };
  }

  try {
    const ext = LOGO_EXT[file.type as keyof typeof LOGO_EXT];
    const { url } = await put(`tenants/${ctx.tenantId}/logo-${Date.now()}.${ext}`, file, {
      access: "public",
      token: env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type,
    });
    await upsertBranding(ctx, { logoBlobUrl: url });
    revalidatePath(SETTINGS_PATH);
    return { ok: true, url };
  } catch (err) {
    console.error("[branding] uploadLogo failed:", err);
    return { ok: false, error: "Couldn't upload your logo. Please try again." };
  }
}
