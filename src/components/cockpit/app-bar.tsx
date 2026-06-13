"use client";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ActivityMenu, type AttentionItem } from "./activity-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandMenu } from "./command-menu";
import { HelpMenu } from "./help-menu";
import { ProfileMenu } from "./profile-menu";

export type AppBarProps = {
  user: { name: string; email: string };
  engagements: { id: string; name: string }[];
  attention: AttentionItem[];
};

export function AppBar({ user, engagements, attention }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1">
        <CommandMenu engagements={engagements} />
        <ActivityMenu attention={attention} />
        <HelpMenu />
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
