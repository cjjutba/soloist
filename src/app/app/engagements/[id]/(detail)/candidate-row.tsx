"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/relative-time";
import { SHIP_STATUS, SHIP_STATUS_KEYS, toShipStatus } from "@/components/ui/ship-status";
import type { CandidateView } from "./curation-queue";

type Props = {
  candidate: CandidateView;
  focused: boolean;
  selected: boolean;
  onFocus: () => void;
  onToggleSelect: () => void;
  onSetStatus: (statusTag: string) => void;
  onDismiss: () => void;
  /** Returns true on success; the row reverts its local value on false. */
  onSaveField: (patch: { title?: string; summary?: string | null }) => Promise<boolean>;
  /** Register this row's imperative handle (for the `e` shortcut) under its id; returns an
   * unregister cleanup. Passed straight from the parent's stable useCallback (not an inline
   * arrow) so the register effect doesn't churn on every queue re-render. */
  register: (id: string, api: { enterEdit: () => void }) => () => void;
};

/** One curation-queue row = a ship-update card in edit mode (DESIGN.md L182): inline-edit title
 * (click or `e` → blur saves, Esc reverts), a status segmented toggle, and a dismiss control.
 * No Publish — that's the Story 3.6 gate. `raw_meta` is never passed in, let alone rendered. */
export function CandidateRow({
  candidate,
  focused,
  selected,
  onFocus,
  onToggleSelect,
  onSetStatus,
  onDismiss,
  onSaveField,
  register,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  // Escape cancels by blurring; these flags tell the resulting onBlur to skip the save (else the
  // unmount-triggered blur would commit the value the user is trying to discard).
  const cancelTitle = useRef(false);
  const cancelSummary = useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  // Edit buffers — seeded from the CURRENT prop when an edit starts (so they're never stale),
  // not synced via effect. The non-editing display reads `candidate.*` directly.
  const [title, setTitle] = useState(candidate.title);
  const [summary, setSummary] = useState(candidate.summary ?? "");

  // Stable so the register effect (the `e` shortcut) doesn't re-run every render; re-created only
  // when the title prop changes so the edit buffer is seeded fresh.
  const startTitleEdit = useCallback(() => {
    setTitle(candidate.title);
    setEditingTitle(true);
  }, [candidate.title]);
  function startSummaryEdit() {
    setSummary(candidate.summary ?? "");
    setEditingSummary(true);
  }

  // The `e` shortcut enters title-edit on the focused row.
  useEffect(
    () => register(candidate.id, { enterEdit: startTitleEdit }),
    [register, candidate.id, startTitleEdit],
  );

  // Move DOM focus + scroll into view when this becomes the focused row (keyboard nav) — but NOT
  // while a field is being edited, so click-to-edit (which also focuses the row) can't yank focus
  // off the input. On exiting an edit, focus returns to the row.
  useEffect(() => {
    if (focused && !editingTitle && !editingSummary) {
      containerRef.current?.focus();
      containerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [focused, editingTitle, editingSummary]);

  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingSummary) summaryRef.current?.focus();
  }, [editingSummary]);

  const current = toShipStatus(candidate.statusTag);

  async function commitTitle() {
    setEditingTitle(false);
    if (cancelTitle.current) {
      cancelTitle.current = false;
      setTitle(candidate.title); // Esc → discard
      return;
    }
    const next = title.trim();
    if (!next) {
      setTitle(candidate.title); // a title is required — revert an emptied field
      return;
    }
    if (next === candidate.title) return; // unchanged → no write (no needless edited_at bump)
    if (!(await onSaveField({ title: next }))) setTitle(candidate.title);
  }

  async function commitSummary() {
    setEditingSummary(false);
    const prev = candidate.summary ?? "";
    if (cancelSummary.current) {
      cancelSummary.current = false;
      setSummary(prev); // Esc → discard
      return;
    }
    const next = summary.trim();
    if (next === prev) return; // unchanged
    if (!(await onSaveField({ summary: next === "" ? null : next }))) setSummary(prev);
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onFocus={onFocus}
      onClick={onFocus}
      className={cn(
        "rounded-[var(--radius-lg)] border bg-card p-4 text-card-foreground shadow-sm outline-none transition-colors",
        focused ? "border-ring ring-2 ring-ring" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1 hidden lg:block"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select "${candidate.title}"`}
        />

        <div className="min-w-0 flex-1">
          {/* Title — click-to-edit, blur-to-save */}
          {editingTitle ? (
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur(); // → commitTitle saves
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitle.current = true;
                  e.currentTarget.blur(); // → commitTitle discards
                }
              }}
              className="h-8 text-sm font-medium"
              aria-label="Edit title"
            />
          ) : (
            <button
              type="button"
              onClick={startTitleEdit}
              className="block w-full truncate text-left text-sm font-medium hover:text-foreground/80"
              title="Click to edit"
            >
              {candidate.title}
            </button>
          )}

          {/* Summary — click-to-edit, blur-to-save */}
          {editingSummary ? (
            <Textarea
              ref={summaryRef}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={commitSummary}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelSummary.current = true;
                  e.currentTarget.blur(); // → commitSummary discards
                }
              }}
              className="mt-1 min-h-16 text-sm"
              aria-label="Edit summary"
            />
          ) : (
            <button
              type="button"
              onClick={startSummaryEdit}
              className="mt-0.5 block w-full text-left text-sm text-muted-foreground hover:text-foreground/70"
              title="Click to edit"
            >
              {candidate.summary || <span className="italic">Add a summary…</span>}
            </button>
          )}

          {/* Status toggle + meta + dismiss */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Set status">
              {SHIP_STATUS_KEYS.map((key) => {
                const s = SHIP_STATUS[key];
                const active = current === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSetStatus(key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                      active
                        ? s.classes
                        : "bg-muted/50 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span aria-hidden="true">{s.emoji}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>

            <span className="ml-auto flex items-center gap-3">
              <time
                dateTime={candidate.createdAt.toISOString()}
                className="font-mono text-xs text-muted-foreground"
              >
                {formatRelativeTime(candidate.createdAt)}
              </time>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
