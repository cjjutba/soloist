import type { DashboardEngagement } from "@/server/db/repositories/engagements.repository";

export type OverviewKpis = { activeEngagements: number; awaitingCuration: number; unreadMessages: number };

export function summarizeDashboard(rows: DashboardEngagement[]): OverviewKpis {
  return {
    activeEngagements: rows.length,
    awaitingCuration: rows.reduce((n, e) => n + e.candidateCount, 0),
    unreadMessages: rows.reduce((n, e) => n + e.chatUnreadCount, 0),
  };
}

export type WeekBucket = { weekStart: string; count: number };

function startOfWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const mondayIndex = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  x.setUTCDate(x.getUTCDate() - mondayIndex);
  return x;
}

/** `weeks` consecutive Monday-started week buckets ending with the week containing `now`,
 * each counting the `dates` that fall inside it. Dates outside the window are ignored. */
export function bucketByWeek(dates: Date[], weeks: number, now: Date): WeekBucket[] {
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const currentWeekStart = startOfWeekUTC(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(currentWeekStart.getTime() - i * MS_WEEK);
    buckets.push({ weekStart: ws.toISOString().slice(0, 10), count: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const d of dates) {
    const key = startOfWeekUTC(d).toISOString().slice(0, 10);
    const i = index.get(key);
    if (i !== undefined) buckets[i].count++;
  }
  return buckets;
}

export type CurrencyTotal = { currency: string; minor: number };

/** The currency bucket with the largest total (the KPI headline), or null if there are none. */
export function pickDominantCurrency(totals: CurrencyTotal[]): CurrencyTotal | null {
  if (totals.length === 0) return null;
  return [...totals].sort((a, b) => b.minor - a.minor)[0];
}
