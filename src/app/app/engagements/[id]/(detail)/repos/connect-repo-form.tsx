"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectRepoAction } from "@/server/repo-connections/repo-connections.actions";

type PickRepo = { fullName: string; private: boolean };

/** Connect-a-repo control (AC-1): a picker of the App's installed repos (minus the ones already
 * actively connected here) + the action call. The server re-verifies the repo against the
 * installation, so a stale option can't inject an arbitrary repo. */
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
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await connectRepoAction({ engagementId, repoFullName: selected });
      if (res.ok) {
        toast.success("Repository connected.");
        setSelected("");
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
            ? "Pick a repo the app is installed on to feed this engagement."
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
            className="flex flex-wrap items-center gap-3"
          >
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Repository to connect"
              className="h-10 min-w-[16rem] rounded-[var(--radius-md)] border border-input bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="">Select a repository…</option>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName}
                  {r.private ? " (private)" : ""}
                </option>
              ))}
            </select>
            <Button type="submit" loading={busy} disabled={!selected}>
              Connect
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
