import { Users } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function ClientsPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Users}
      title="Clients"
      description="A unified directory of everyone you work with across engagements, with contact history and access."
    />
  );
}
