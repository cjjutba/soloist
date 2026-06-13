import { cache } from "react";
import type { FreelancerSession } from "@/server/auth/session";
import { listDashboard, type DashboardEngagement } from "@/server/db/repositories/engagements.repository";

/** The cockpit dashboard read, request-memoized so the layout (chrome) and the Overview page
 * share a single set of queries within one render. */
export const getCockpitDashboard = cache(
  (session: FreelancerSession): Promise<DashboardEngagement[]> => listDashboard(session),
);
