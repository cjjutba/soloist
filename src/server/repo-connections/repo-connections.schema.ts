import { z } from "zod";

/** A git branch name — trimmed, non-empty, length-bounded (Git's practical ceiling). */
const branchName = z.string().trim().min(1, "Pick a branch.").max(255);

/** Connect payload (AC-1). `repoFullName` is the GitHub `owner/repo` the picker selected.
 * `productionBranch` (optional) is the branch whose activity feeds the feed; omitted → the
 * ingestion filter falls back to the repo's GitHub default branch. */
export const connectRepoSchema = z.object({
  engagementId: z.uuid(),
  repoFullName: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/[^/\s]+$/, "Pick a repository to connect."),
  productionBranch: branchName.optional(),
});
export type ConnectRepoInput = z.infer<typeof connectRepoSchema>;

/** Retarget a connection's production branch. */
export const setProductionBranchSchema = z.object({
  engagementId: z.uuid(),
  connectionId: z.uuid(),
  productionBranch: branchName,
});
export type SetProductionBranchInput = z.infer<typeof setProductionBranchSchema>;

/** List a repo's branches for the production-branch picker. */
export const listRepoBranchesSchema = z.object({
  engagementId: z.uuid(),
  repoFullName: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/[^/\s]+$/, "Pick a repository."),
});
export type ListRepoBranchesInput = z.infer<typeof listRepoBranchesSchema>;

/** Disconnect payload (AC-2). */
export const disconnectRepoSchema = z.object({
  engagementId: z.uuid(),
  connectionId: z.uuid(),
});
export type DisconnectRepoInput = z.infer<typeof disconnectRepoSchema>;

/** Retry payload (Story 3.9 — re-run a failed connection's pull). */
export const retryConnectionSchema = z.object({
  engagementId: z.uuid(),
  connectionId: z.uuid(),
});
export type RetryConnectionInput = z.infer<typeof retryConnectionSchema>;
