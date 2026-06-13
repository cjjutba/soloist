import { Receipt } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Invoices · Soloist" };

export default async function InvoicesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Receipt}
      title="Invoices"
      description="A roll-up of every invoice across engagements. For now, manage invoices inside each engagement's Documents tab."
    />
  );
}
