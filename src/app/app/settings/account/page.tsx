import type { Metadata } from "next";
import { getAppSession, requireFreelancer } from "@/server/auth/session";
import { getTenant } from "@/server/db/repositories/tenants.repository";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Account · Soloist" };

export default async function AccountSettingsPage() {
  const ctx = await requireFreelancer();
  const [session, tenant] = await Promise.all([getAppSession(), getTenant(ctx)]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your login. Workspace:{" "}
          <span className="font-medium text-foreground">{tenant?.name ?? "—"}</span>.
        </p>
      </header>
      <AccountForm
        initialName={session?.name ?? ""}
        currentEmail={session?.email ?? ""}
      />
    </section>
  );
}
