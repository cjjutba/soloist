import { Activity } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Timeline · Soloist" };

export default async function TimelinePage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Activity}
      title="Timeline"
      description="A chronological feed of everything that's happened across your workspace — ships, messages, and invoices."
    />
  );
}
