import { MessageSquare } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Messages · Soloist" };

export default async function MessagesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={MessageSquare}
      title="Messages"
      description="One inbox for every client conversation. For now, open an engagement to chat with that client."
    />
  );
}
