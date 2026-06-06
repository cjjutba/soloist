"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectRepoAction } from "@/server/repo-connections/repo-connections.actions";

/** Disconnect a repo from this Engagement (AC-2). Confirms first (it stops auto-pull). The
 * action is RLS-scoped, so it can only ever touch the caller's own connection. */
export function DisconnectButton({
  engagementId,
  connectionId,
  repoFullName,
}: {
  engagementId: string;
  connectionId: string;
  repoFullName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDisconnect() {
    if (!window.confirm(`Disconnect ${repoFullName}? It will stop feeding this engagement.`)) return;
    setBusy(true);
    try {
      const res = await disconnectRepoAction({ engagementId, connectionId });
      if (res.ok) {
        toast.success("Repository disconnected.");
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
    <Button variant="outline" size="sm" onClick={onDisconnect} loading={busy}>
      Disconnect
    </Button>
  );
}
