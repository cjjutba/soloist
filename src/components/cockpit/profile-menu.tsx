"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Palette, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/auth/client";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!).join("");
  return (letters || "S").toUpperCase();
}

export function ProfileMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();

  async function onLogout() {
    // signOut can REJECT on a network failure (not just return {error}); without this
    // try/catch the `void onLogout()` call site would swallow it as an unhandled rejection
    // and the user would get no feedback. Mirrors logout-button.tsx + portal-nav.tsx.
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("Couldn't sign out. Please try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Please try again.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="Account menu">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initialsOf(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium md:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cockpit-surface w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span>{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings/account">
            <User className="size-4" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings/branding">
            <Palette className="size-4" />
            Brand
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void onLogout();
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
