"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FOOTER_ITEMS, NAV_GROUPS } from "./nav-config";

const ALL_NAV = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_ITEMS];

export function CommandMenu({ engagements }: { engagements: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} className="cockpit-surface">
        <CommandInput placeholder="Search engagements and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {ALL_NAV.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon className="size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {engagements.length > 0 ? (
            <CommandGroup heading="Engagements">
              {engagements.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`engagement ${e.name}`}
                  onSelect={() => go(`/app/engagements/${e.id}`)}
                >
                  {e.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
