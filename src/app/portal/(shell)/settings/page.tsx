import { FocusHeading } from "@/components/ui/focus-heading";
import { requireOnboardedClient } from "@/server/auth/session";
import { NotificationPrefToggle } from "../notification-pref-toggle";

// The Client Portal settings (Story 4.4) — a calm, single-card home for the one v1 preference:
// the global notification on/off. RSC reads the pref from the session (already on the ClientAccess
// row — no extra query); the toggle island only WRITES. Reachable from the avatar menu.
export default async function PortalSettingsPage() {
  const session = await requireOnboardedClient();
  const enabled = session.notificationsEnabled ?? true;

  return (
    <div className="flex flex-col gap-6">
      <FocusHeading className="font-display text-2xl">Settings</FocusHeading>
      <section
        aria-labelledby="settings-notifications"
        className="rounded-[var(--radius-lg)] border border-border bg-card p-5"
      >
        <h2 id="settings-notifications" className="sr-only">
          Notifications
        </h2>
        <NotificationPrefToggle initialEnabled={enabled} />
      </section>
    </div>
  );
}
