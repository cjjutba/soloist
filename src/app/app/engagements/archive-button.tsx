"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveEngagementAction } from "@/server/engagements/engagements.actions";

/** Soft-archive an Engagement from the list (AC-3). Confirms first — archiving drops it
 * off the active list. The server action is RLS-scoped, so this can only ever touch the
 * caller's own row. */
export function ArchiveButton({
  id,
  name,
  redirectTo,
}: {
  id: string;
  name: string;
  /** Where to go on success. Omit to stay put and just refresh (the list case). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onArchive() {
    if (!window.confirm(`Archive “${name}”? It will drop off your active list.`)) return;
    setBusy(true);
    try {
      const res = await archiveEngagementAction(id);
      if (res.ok) {
        toast.success("Engagement archived.");
        if (redirectTo) router.push(redirectTo);
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
    <Button variant="outline" size="sm" onClick={onArchive} loading={busy}>
      Archive
    </Button>
  );
}
