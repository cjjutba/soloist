"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryConnectionAction } from "@/server/repo-connections/repo-connections.actions";

/** Re-run a failed connection's pull immediately (Story 3.9). The action is RLS-scoped, so it can
 * only touch the caller's own connection; on success the card returns to Connected. */
export function RetryButton({
  engagementId,
  connectionId,
}: {
  engagementId: string;
  connectionId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRetry() {
    setBusy(true);
    try {
      const res = await retryConnectionAction({ engagementId, connectionId });
      if (res.ok) {
        toast.success("Re-checked — GitHub is reachable again.");
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
    <Button variant="outline" size="sm" onClick={onRetry} loading={busy}>
      Retry
    </Button>
  );
}
