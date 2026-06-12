"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MESSAGE_MAX } from "@/server/chat/chat.schema";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const TYPING_IDLE_MS = 1500; // stop broadcasting "typing" after this much keyboard silence

/**
 * The chat message composer (realtime slice 3). Enter sends, Shift+Enter inserts a newline. While
 * the field has content the caller is broadcast as "typing" (presence), reset on send / idle / blur.
 * Sending is optimistic-free: on success the parent refetches the thread.
 */
export function ChatComposer({
  onSend,
  onTyping,
  otherLabel,
}: {
  onSend: (body: string) => Promise<boolean>;
  onTyping: (typing: boolean) => void;
  otherLabel: string;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending idle timer on unmount so it can't fire onTyping(false) into a torn-down tree.
  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  function stopTyping() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    onTyping(false);
  }

  function handleChange(next: string) {
    setValue(next);
    if (next.trim()) {
      onTyping(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => onTyping(false), TYPING_IDLE_MS);
    } else {
      stopTyping();
    }
  }

  async function submit() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    stopTyping();
    try {
      const ok = await onSend(body);
      if (ok) setValue("");
      else toast.error("Couldn't send that. Please try again.");
    } catch {
      toast.error("Couldn't send that. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-background pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={stopTyping}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        maxLength={MESSAGE_MAX}
        aria-label={`Message ${otherLabel}`}
        placeholder={`Message ${otherLabel}…`}
        className={cn(
          "max-h-40 min-h-11 flex-1 resize-y rounded-[var(--radius-md)] border border-border bg-card px-3 py-2.5 text-sm",
          "placeholder:text-muted-foreground",
          FOCUS_RING,
        )}
      />
      <button
        type="submit"
        disabled={sending || !value.trim()}
        aria-label="Send message"
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
          FOCUS_RING,
        )}
      >
        {sending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Send className="size-5" aria-hidden />
        )}
      </button>
    </form>
  );
}
