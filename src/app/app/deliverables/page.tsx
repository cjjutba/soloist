import { Package } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export default async function DeliverablesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Package}
      title="Deliverables"
      description="The tangible outputs you hand off to clients, versioned and linked to their engagement."
    />
  );
}
