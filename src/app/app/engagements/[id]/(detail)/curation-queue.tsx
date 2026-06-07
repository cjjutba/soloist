"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  bulkDismissCandidatesAction,
  dismissCandidateAction,
  editCandidateAction,
} from "@/server/ship-feed/curation.actions";
import {
  bulkPublishCandidatesAction,
  publishCandidateAction,
} from "@/server/ship-feed/publish.actions";
import { CandidateRow } from "./candidate-row";
import { isEditableTarget, nextIndex } from "./keyboard";

/** The Client-safe projection of a candidate `ship_updates` row (never `raw_meta`). */
export type CandidateView = {
  id: string;
  title: string;
  summary: string | null;
  statusTag: string;
  createdAt: Date;
};

/** Imperative handle a row registers so the `e` shortcut can enter its inline-edit. */
type RowApi = { enterEdit: () => void };

export function CurationQueue({
  engagementId,
  candidates,
}: {
  engagementId: string;
  candidates: CandidateView[];
}) {
  const router = useRouter();
  // Focus is tracked by candidate ID, not index — so when the list shrinks (a dismiss/refresh),
  // the ring + shortcuts follow the same candidate (or clear if it's gone), never silently
  // re-pointing at whatever row slid into an index.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const registry = useRef<Map<string, RowApi>>(new Map());
  // Per-candidate in-flight guard — dedupes a double-click / `p`/`x` key-repeat on the SAME row
  // (a second concurrent publish/dismiss would hit the state guard → null → a confusing
  // "no longer in your queue" error right after a success). Ref, so it never triggers a re-render.
  const inFlight = useRef<Set<string>>(new Set());

  const register = useCallback((id: string, api: RowApi) => {
    registry.current.set(id, api);
    return () => {
      registry.current.delete(id);
    };
  }, []);

  // Action helpers — single source of action-handling + toasts, shared by the row's visible
  // controls AND the keyboard shortcuts. router.refresh() reconciles with the server read.
  const onSetStatus = useCallback(
    async (id: string, statusTag: string) => {
      const res = await editCandidateAction({ id, engagementId, statusTag });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [engagementId, router],
  );

  const onDismiss = useCallback(
    async (id: string) => {
      if (inFlight.current.has(id)) return;
      inFlight.current.add(id);
      try {
        const res = await dismissCandidateAction({ id, engagementId });
        if (res.ok) {
          toast.success("Candidate dismissed.");
          setSelected((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } finally {
        inFlight.current.delete(id);
      }
    },
    [engagementId, router],
  );

  const onPublish = useCallback(
    async (id: string) => {
      if (inFlight.current.has(id)) return;
      inFlight.current.add(id);
      try {
        const res = await publishCandidateAction({ id, engagementId });
        if (res.ok) {
          toast.success("Published — your client will be notified.");
          setSelected((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } finally {
        inFlight.current.delete(id);
      }
    },
    [engagementId, router],
  );

  const onSaveField = useCallback(
    async (id: string, patch: { title?: string; summary?: string | null }) => {
      const res = await editCandidateAction({ id, engagementId, ...patch });
      if (res.ok) {
        router.refresh();
        return true;
      }
      toast.error(res.error);
      return false;
    },
    [engagementId, router],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  // Global keyboard primitives (UX-DR18): j/k navigate, e edits, 1/2/3 set status, x dismisses.
  // Suppressed while a text field is focused so typing never fires an action; ? toggles help.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (isEditableTarget(t?.tagName, t?.isContentEditable)) return; // never hijack typing
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }

      const idx = focusedId ? candidates.findIndex((c) => c.id === focusedId) : -1;
      const id = idx >= 0 ? candidates[idx].id : undefined;
      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedId(candidates[nextIndex(idx, candidates.length, 1)]?.id ?? null);
          break;
        case "k":
          e.preventDefault();
          setFocusedId(candidates[nextIndex(idx, candidates.length, -1)]?.id ?? null);
          break;
        case "e":
          if (id) {
            e.preventDefault();
            registry.current.get(id)?.enterEdit();
          }
          break;
        case "1":
          if (id) {
            e.preventDefault();
            void onSetStatus(id, "shipped");
          }
          break;
        case "2":
          if (id) {
            e.preventDefault();
            void onSetStatus(id, "in_progress");
          }
          break;
        case "3":
          if (id) {
            e.preventDefault();
            void onSetStatus(id, "next");
          }
          break;
        case "x":
          if (id) {
            e.preventDefault();
            void onDismiss(id);
          }
          break;
        case "p":
          if (id) {
            e.preventDefault();
            void onPublish(id);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, candidates, onSetStatus, onDismiss, onPublish]);

  async function onBulkDismiss() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const res = await bulkDismissCandidatesAction({ ids: [...selected], engagementId });
    if (res.ok) {
      toast.success(`Dismissed ${res.count} ${res.count === 1 ? "candidate" : "candidates"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(res.error);
    }
    setBulkBusy(false);
  }

  async function onBulkPublish() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const res = await bulkPublishCandidatesAction({ ids: [...selected], engagementId });
    if (res.ok) {
      toast.success(`Published ${res.count} ${res.count === 1 ? "update" : "updates"}.`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(res.error);
    }
    setBulkBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} to curate
        </p>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={showHelp}
        >
          Keyboard shortcuts (?)
        </button>
      </div>

      {showHelp ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-mono">j</span>/<span className="font-mono">k</span> move ·{" "}
          <span className="font-mono">e</span> edit · <span className="font-mono">1</span>/
          <span className="font-mono">2</span>/<span className="font-mono">3</span> set ✅/🚧/📦 ·{" "}
          <span className="font-mono">p</span> publish · <span className="font-mono">x</span> dismiss ·{" "}
          <span className="font-mono">Esc</span> exits an edit
        </div>
      ) : null}

      {/* Bulk-select action bar — lg+ only (UX-DR18 / EXPERIENCE.md L171). */}
      {selected.size > 0 ? (
        <div className="sticky top-2 z-10 hidden items-center justify-between rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm lg:flex">
          <span className="text-sm">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={onBulkDismiss} loading={bulkBusy}>
              Dismiss selected
            </Button>
            <Button variant="default" size="sm" onClick={onBulkPublish} loading={bulkBusy}>
              Publish selected
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="flex flex-col gap-3">
        {candidates.map((c) => (
          <li key={c.id}>
            <CandidateRow
              candidate={c}
              focused={c.id === focusedId}
              selected={selected.has(c.id)}
              onFocus={() => setFocusedId(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
              onSetStatus={(statusTag) => onSetStatus(c.id, statusTag)}
              onDismiss={() => onDismiss(c.id)}
              onPublish={() => onPublish(c.id)}
              onSaveField={(patch) => onSaveField(c.id, patch)}
              register={register}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
