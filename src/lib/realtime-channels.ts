/** Realtime channel names — shared by the server (publish + token capability) and the client
 * (subscribe), so the two never drift. Pure strings only; safe to import anywhere. */
export const engagementChannel = (engagementId: string) => `engagement:${engagementId}`;
export const userChannel = (userId: string) => `user:${userId}`;
