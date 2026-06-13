import { ListChecks } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Tasks · Soloist" };

export default async function TasksPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={ListChecks}
      title="Tasks"
      description="Track the work in flight per engagement, with due dates and status. Coming soon."
    />
  );
}
