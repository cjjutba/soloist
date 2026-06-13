"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AttentionItem = { id: string; name: string; candidateCount: number; unreadCount: number };

function summaryFor(a: AttentionItem): string {
  const bits: string[] = [];
  if (a.candidateCount > 0) bits.push(`${a.candidateCount} to curate`);
  if (a.unreadCount > 0) bits.push(`${a.unreadCount} unread`);
  return bits.join(" · ");
}

export function ActivityMenu({ attention }: { attention: AttentionItem[] }) {
  const total = attention.reduce((n, a) => n + a.candidateCount + a.unreadCount, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label="Activity">
          <Bell className="size-4" />
          {total > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-80">
        <DropdownMenuLabel>Needs your attention</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {attention.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
        ) : (
          attention.map((a) => (
            <DropdownMenuItem key={a.id} asChild>
              <Link href={`/app/engagements/${a.id}`} className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">{summaryFor(a)}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app">View overview</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
