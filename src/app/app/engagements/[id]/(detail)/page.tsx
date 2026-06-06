import { TabPlaceholder } from "./tab-placeholder";

// Ship Feed (curation queue) — the default tab. The shell layout already guarded the
// engagement, so this is a pure placeholder until Epic 3 builds the curation queue.
export default function ShipFeedTab() {
  return (
    <TabPlaceholder
      title="Ship Feed"
      body="Connect a repo to auto-pull updates, or write one by hand. The curation queue arrives in Epic 3."
    />
  );
}
