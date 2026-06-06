import { z } from "zod";

/** The lifecycle states an Engagement can be in. `archived` hides it from the active
 * list (soft-delete) without losing history. */
export const ENGAGEMENT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

const name = z.string().trim().min(1, "Give the engagement a name.").max(120, "Keep the name under 120 characters.");
const clientDisplayName = z
  .string()
  .trim()
  .min(1, "Add the client's name as it should appear to them.")
  .max(120, "Keep the client name under 120 characters.");
const scopeText = z.string().trim().max(2000, "Keep the scope under 2000 characters.");
// On CREATE: a missing/blank scope becomes null (no scope set).
const createScope = scopeText.optional().transform((v) => (v ? v : null));
// On UPDATE: keep `undefined` meaning "leave unchanged" (Drizzle skips undefined keys
// in .set()), while an explicit empty string clears it to null. Without this split, a
// partial edit (e.g. renaming) would wipe an existing scope.
const updateScope = scopeText.optional().transform((v) => (v === undefined ? undefined : v ? v : null));

/** New-engagement form payload (AC-1). */
export const createEngagementSchema = z.object({ name, clientDisplayName, scope: createScope });
export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;

/** Edit payload (AC-2/AC-3) — every field optional so the form can patch. */
export const updateEngagementSchema = z.object({
  name: name.optional(),
  clientDisplayName: clientDisplayName.optional(),
  scope: updateScope,
  status: z.enum(ENGAGEMENT_STATUSES).optional(),
});
export type UpdateEngagementInput = z.infer<typeof updateEngagementSchema>;
