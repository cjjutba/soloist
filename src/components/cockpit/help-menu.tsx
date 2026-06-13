"use client";

import { BookOpen, HelpCircle, Keyboard, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Help">
          <HelpCircle className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-56">
        <DropdownMenuLabel>Help &amp; resources</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="https://github.com/cjjutba/soloist" target="_blank" rel="noreferrer">
            <BookOpen className="size-4" />
            Documentation
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Keyboard className="size-4" />
          Keyboard shortcuts
          <span className="ml-auto font-mono text-xs text-muted-foreground">⌘K</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="mailto:support@soloist.app">
            <LifeBuoy className="size-4" />
            Contact support
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
