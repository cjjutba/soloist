"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listRepoBranchesAction,
  setProductionBranchAction,
} from "@/server/repo-connections/repo-connections.actions";

/** The production branch a connection tracks, with inline edit (Repos tab). Shows the current
 * branch (or "default branch" when unset → ingestion falls back to the GitHub default); the
 * freelancer can change it from the repo's branch list. RLS scopes the write to their own repo. */
export function ProductionBranchControl({
  engagementId,
  connectionId,
  repoFullName,
  productionBranch,
}: {
  engagementId: string;
  connectionId: string;
  repoFullName: string;
  productionBranch: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState(productionBranch ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onEdit() {
    setEditing(true);
    setLoading(true);
    try {
      const res = await listRepoBranchesAction({ engagementId, repoFullName });
      if (res.ok) {
        setBranches(res.branches);
        setBranch(productionBranch ?? res.defaultBranch ?? res.branches[0] ?? "");
      } else {
        toast.error(res.error);
        setEditing(false);
      }
    } catch {
      toast.error("Couldn’t load branches. Please try again.");
      setEditing(false);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!branch || saving) return;
    setSaving(true);
    try {
      const res = await setProductionBranchAction({ engagementId, connectionId, productionBranch: branch });
      if (res.ok) {
        toast.success(`Now tracking ${branch}.`);
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          Tracking{" "}
          <span className="font-mono text-foreground">{productionBranch ?? "default branch"}</span>
        </span>
        <button
          type="button"
          onClick={() => void onEdit()}
          className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Change
        </button>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        aria-label="Production branch"
        disabled={loading || saving}
        className="h-8 min-w-[12rem] rounded-[var(--radius-md)] border border-input bg-card px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      >
        {loading ? (
          <option value="">Loading…</option>
        ) : (
          branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))
        )}
      </select>
      <Button type="button" size="sm" loading={saving} disabled={!branch || loading} onClick={() => void onSave()}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </span>
  );
}
