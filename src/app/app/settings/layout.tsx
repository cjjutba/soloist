import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

// Cockpit settings shell — shared container + sub-nav (Account · Branding). The /app
// layout already guards the subtree; each settings page also self-guards.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <SettingsNav />
      {children}
    </main>
  );
}
