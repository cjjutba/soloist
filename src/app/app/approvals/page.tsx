import { BadgeCheck } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Approvals · Soloist" };

export default async function ApprovalsPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={BadgeCheck}
      title="Approvals"
      description="Everything waiting on a client sign-off, in one queue. Coming soon."
    />
  );
}
