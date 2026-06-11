"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  connectRepoAction,
  listRepoBranchesAction,
} from "@/server/repo-connections/repo-connections.actions";

type PickRepo = { fullName: string; private: boolean };

const selectClass =
  "h-10 min-w-[16rem] rounded-[var(--radius-md)] border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50";

/** Connect-a-repo control (AC-1): a picker of the App's installed repos (minus the ones already
 * actively connected here) + a production-branch picker (loaded on repo select; defaults to the
 * repo's GitHub default branch). The server re-verifies the repo against the installation, so a
 * stale option can't inject an arbitrary repo. */
export function ConnectRepoForm({
  engagementId,
  repos,
  hasConnections,
}: {
  engagementId: string;
  repos: PickRepo[];
  /** When this Engagement has no active connection, the form doubles as the empty state. */
  hasConnections: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [branchState, setBranchState] = useState<"idle" | "loading" | "error">("idle");
  const [busy, setBusy] = useState(false);
  // Sequence token: a slow branch-fetch for a previously-selected repo must not overwrite a
  // newer selection's list (else you could connect a repo tracking the WRONG repo's branch).
  const reqSeq = useRef(0);

  async function onRepoChange(repoFullName: string) {
    const seq = ++reqSeq.current;
    setSelected(repoFullName);
    setBranches([]);
    setBranch("");
    if (!repoFullName) {
      setBranchState("idle");
      return;
    }
    setBranchState("loading");
    try {
      const res = await listRepoBranchesAction({ engagementId, repoFullName });
      if (seq !== reqSeq.current) return; // a newer repo was selected — ignore this stale response
      if (res.ok) {
        setBranches(res.branches);
        setBranch(res.defaultBranch ?? res.branches[0] ?? "");
        setBranchState("idle");
      } else {
        setBranchState("error"); // connect can still proceed → tracks the default branch
      }
    } catch {
      if (seq === reqSeq.current) setBranchState("error");
    }
  }

  async function onConnect() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await connectRepoAction({
        engagementId,
        repoFullName: selected,
        productionBranch: branch || undefined,
      });
      if (res.ok) {
        toast.success("Repository connected.");
        setSelected("");
        setBranches([]);
        setBranch("");
        setBranchState("idle");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{hasConnections ? "Connect a repository" : "No repo connected yet"}</CardTitle>
        <CardDescription>
          {hasConnections
            ? "Pick a repo and the branch whose activity should feed this engagement."
            : "Connect GitHub to auto-pull updates — or write one by hand. Pick a repo to start."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {repos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No more repositories available to connect. Install the app on another repo to add it here.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onConnect();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selected}
                onChange={(e) => void onRepoChange(e.target.value)}
                aria-label="Repository to connect"
                className={selectClass}
              >
                <option value="">Select a repository…</option>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                    {r.private ? " (private)" : ""}
                  </option>
                ))}
              </select>
              {selected ? (
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  aria-label="Production branch"
                  disabled={branchState === "loading" || branches.length === 0}
                  className={selectClass}
                >
                  {branchState === "loading" ? (
                    <option value="">Loading branches…</option>
                  ) : branches.length === 0 ? (
                    <option value="">Default branch</option>
                  ) : (
                    branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))
                  )}
                </select>
              ) : null}
              <Button type="submit" loading={busy} disabled={!selected}>
                Connect
              </Button>
            </div>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {branchState === "error"
                  ? "Couldn’t load branches — we’ll track the repo’s default branch."
                  : "Only activity on this branch (plus releases) becomes an update."}
              </p>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
