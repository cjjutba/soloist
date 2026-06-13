import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export type AttentionItem = { id: string; name: string; candidateCount: number; unreadCount: number };
export type CockpitChrome = {
  engagements: { id: string; name: string }[];
  engagementsActiveCount: number;
  attention: AttentionItem[];
};

/** Derive everything the persistent chrome needs (sidebar count, ⌘K palette list, activity bell)
 * from the one dashboard read — no extra queries. */
export function buildCockpitChrome(dashboard: DashboardEngagement[]): CockpitChrome {
  return {
    engagements: dashboard.map((e) => ({ id: e.id, name: e.name })),
    engagementsActiveCount: dashboard.length,
    attention: dashboard
      .filter((e) => e.candidateCount > 0 || e.chatUnreadCount > 0)
      .map((e) => ({ id: e.id, name: e.name, candidateCount: e.candidateCount, unreadCount: e.chatUnreadCount })),
  };
}
