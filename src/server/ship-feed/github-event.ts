/**
 * Normalize a raw GitHub webhook payload into the minimal shape the candidate pipeline needs
 * (Story 3.1). Returns `null` for non-qualifying events (PR noise like `synchronize`, a
 * closed-but-unmerged PR, a branch delete) so the Inngest function can no-op cleanly.
 *
 * The `sourceEventKey` is the STABLE idempotency key (unique per Engagement) — a duplicate
 * delivery / an Inngest retry maps to the same key, so `createCandidate` is a no-op. `rawMeta`
 * carries the raw payload detail (SHAs, diffs, full refs) kept off the founder-facing fields;
 * client exposure is gated at publish (3.7), not here.
 */
export type NormalizedGithubEvent =
  | {
      kind: "push";
      repoFullName: string;
      sourceEventKey: string;
      branch: string;
      commitCount: number;
      headCommitMessage: string | null;
      rawMeta: Record<string, unknown>;
    }
  | {
      kind: "pull_request";
      repoFullName: string;
      sourceEventKey: string;
      number: number;
      title: string;
      merged: boolean;
      branch: string;
      rawMeta: Record<string, unknown>;
    }
  | {
      kind: "release";
      repoFullName: string;
      sourceEventKey: string;
      tag: string;
      name: string | null;
      rawMeta: Record<string, unknown>;
    };

// Defensive accessors — the payload is untrusted/loosely-typed webhook JSON.
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function normalizeGithubEvent(
  eventType: string,
  payload: unknown,
): NormalizedGithubEvent | null {
  const p = obj(payload);
  const repoFullName = str(obj(p.repository).full_name);
  if (!repoFullName) return null;

  if (eventType === "push") {
    const ref = str(p.ref) ?? "";
    // Only branch pushes; ignore tag pushes + branch deletes (after = all-zeros).
    if (!ref.startsWith("refs/heads/")) return null;
    const branch = ref.slice("refs/heads/".length);
    const after = str(p.after) ?? "";
    if (!after || /^0+$/.test(after)) return null;
    const commits = Array.isArray(p.commits) ? p.commits : [];
    if (commits.length === 0) return null;
    const headCommitMessage = str(obj(p.head_commit).message);
    return {
      kind: "push",
      repoFullName,
      sourceEventKey: `push:${repoFullName}:${after}`,
      branch,
      commitCount: commits.length,
      headCommitMessage: headCommitMessage ? headCommitMessage.split("\n")[0].trim() : null,
      rawMeta: { after, ref, commitCount: commits.length },
    };
  }

  if (eventType === "pull_request") {
    const action = str(p.action);
    const pr = obj(p.pull_request);
    const number = typeof pr.number === "number" ? pr.number : null;
    const title = str(pr.title);
    if (number === null || !title) return null;
    const merged = pr.merged === true;
    const branch = str(obj(pr.head).ref) ?? "";
    // Qualifying: a newly opened PR, or a CLOSED-AND-MERGED PR. Ignore synchronize/reopen/
    // closed-without-merge noise.
    let phase: "opened" | "merged" | null = null;
    if (action === "opened") phase = "opened";
    else if (action === "closed" && merged) phase = "merged";
    if (!phase) return null;
    return {
      kind: "pull_request",
      repoFullName,
      sourceEventKey: `pr:${repoFullName}:${number}:${phase}`,
      number,
      title,
      merged: phase === "merged",
      branch,
      rawMeta: { number, branch, headSha: str(obj(pr.head).sha) },
    };
  }

  if (eventType === "release") {
    if (str(p.action) !== "published") return null;
    const release = obj(p.release);
    const tag = str(release.tag_name);
    if (!tag) return null;
    return {
      kind: "release",
      repoFullName,
      sourceEventKey: `release:${repoFullName}:${tag}`,
      tag,
      name: str(release.name),
      rawMeta: { tag },
    };
  }

  return null;
}

/**
 * Story 3.2.1: extract the installation id from an `installation.deleted` (uninstall) event, else
 * null. The pipeline uses it to remove the Tenant binding + disconnect that installation's repos.
 */
export function parseInstallationDeleted(eventType: string, payload: unknown): string | null {
  if (eventType !== "installation") return null;
  const p = obj(payload);
  if (str(p.action) !== "deleted") return null;
  const id = obj(p.installation).id;
  return typeof id === "number" || typeof id === "string" ? String(id) : null;
}
