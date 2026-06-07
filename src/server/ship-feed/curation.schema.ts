import { z } from "zod";
import { SHIP_STATUS_KEYS } from "@/components/ui/ship-status";

/** Edit a candidate (Story 3.5): patch any subset of title/summary/statusTag. `engagementId` is
 * carried only to revalidate the right paths (RLS — not this field — is the security boundary).
 * At least one mutable field must be present, else there's nothing to save. */
export const editCandidateSchema = z
  .object({
    id: z.uuid(),
    engagementId: z.uuid(),
    title: z.string().trim().min(1, "A title is required.").max(200, "Keep the title under 200 characters.").optional(),
    summary: z.string().trim().max(2000, "Keep the summary under 2000 characters.").nullable().optional(),
    statusTag: z.enum(SHIP_STATUS_KEYS).optional(),
  })
  .refine((d) => d.title !== undefined || d.summary !== undefined || d.statusTag !== undefined, {
    message: "Nothing to update.",
  });
export type EditCandidateInput = z.infer<typeof editCandidateSchema>;

/** Dismiss one candidate (Story 3.5). */
export const dismissCandidateSchema = z.object({
  id: z.uuid(),
  engagementId: z.uuid(),
});
export type DismissCandidateInput = z.infer<typeof dismissCandidateSchema>;

/** Bulk-dismiss (Story 3.5, `lg+` bulk-select). */
export const bulkDismissSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one candidate.").max(100, "Dismiss at most 100 at a time."),
  engagementId: z.uuid(),
});
export type BulkDismissInput = z.infer<typeof bulkDismissSchema>;

/** Publish one candidate (Story 3.6 — the privacy gate). */
export const publishCandidateSchema = z.object({
  id: z.uuid(),
  engagementId: z.uuid(),
});
export type PublishCandidateInput = z.infer<typeof publishCandidateSchema>;

/** Bulk-publish (Story 3.6, `lg+` bulk-select). */
export const bulkPublishSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one candidate.").max(100, "Publish at most 100 at a time."),
  engagementId: z.uuid(),
});
export type BulkPublishInput = z.infer<typeof bulkPublishSchema>;

/** Author a manual Ship Update by hand (Story 3.8) — title required, summary optional, one status.
 * Becomes a `source='manual'` candidate that flows through the same curation/publish pipeline. */
export const manualUpdateSchema = z.object({
  engagementId: z.uuid(),
  title: z.string().trim().min(1, "A title is required.").max(200, "Keep the title under 200 characters."),
  summary: z.string().trim().max(2000, "Keep the summary under 2000 characters.").nullable().optional(),
  statusTag: z.enum(SHIP_STATUS_KEYS),
});
export type ManualUpdateInput = z.infer<typeof manualUpdateSchema>;
