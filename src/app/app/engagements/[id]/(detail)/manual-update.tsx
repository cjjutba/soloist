"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SHIP_STATUS, SHIP_STATUS_KEYS, type ShipStatus } from "@/components/ui/ship-status";
import { cn } from "@/lib/utils";
import { createManualUpdateAction } from "@/server/ship-feed/manual-update.actions";

/** Write a Ship Update by hand (Story 3.8) — the GitHub-independent fallback, always available
 * (even from the empty queue / with no repo). Creates a `source='manual'` candidate that flows
 * through the same curate → publish pipeline. An inline panel (no Dialog dependency). */
export function ManualUpdate({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<ShipStatus>("in_progress");
  const titleRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setOpen(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function reset() {
    setTitle("");
    setSummary("");
    setStatus("in_progress");
    setOpen(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await createManualUpdateAction({
      engagementId,
      title: title.trim(),
      summary: summary.trim() || null,
      statusTag: status,
    });
    if (res.ok) {
      toast.success("Added to your queue.");
      reset();
      router.refresh();
    } else {
      toast.error(res.error);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={openForm} className="self-start">
        + Write an update
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What shipped? (required)"
          aria-label="Update title"
          maxLength={200}
        />
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="A short plain-English summary (optional)"
          aria-label="Update summary"
          className="min-h-16"
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Set status">
          {SHIP_STATUS_KEYS.map((key) => {
            const s = SHIP_STATUS[key];
            const active = status === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  active ? s.classes : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                <span aria-hidden="true">{s.emoji}</span>
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>
            Add to queue
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
