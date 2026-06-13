import { Files } from "lucide-react";
import { PagePlaceholder } from "@/components/cockpit/page-placeholder";
import { requireFreelancer } from "@/server/auth/session";

export const metadata = { title: "Files · Soloist" };

export default async function FilesPage() {
  await requireFreelancer();
  return (
    <PagePlaceholder
      icon={Files}
      title="Files"
      description="Shared documents and assets across your engagements, with previews and access control."
    />
  );
}
