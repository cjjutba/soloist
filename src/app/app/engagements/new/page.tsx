import type { Metadata } from "next";
import { requireFreelancer } from "@/server/auth/session";
import { EngagementForm } from "../engagement-form";

export const metadata: Metadata = { title: "New engagement · Soloist" };

export default async function NewEngagementPage() {
  // Self-guard (the /app layout also guards the subtree).
  await requireFreelancer();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <EngagementForm mode="create" />
    </main>
  );
}
