import { z } from "zod";

/** Connect payload (AC-1). `repoFullName` is the GitHub `owner/repo` the picker selected. */
export const connectRepoSchema = z.object({
  engagementId: z.uuid(),
  repoFullName: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/[^/\s]+$/, "Pick a repository to connect."),
});
export type ConnectRepoInput = z.infer<typeof connectRepoSchema>;

/** Disconnect payload (AC-2). */
export const disconnectRepoSchema = z.object({
  engagementId: z.uuid(),
  connectionId: z.uuid(),
});
export type DisconnectRepoInput = z.infer<typeof disconnectRepoSchema>;
