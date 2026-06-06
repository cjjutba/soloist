import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

/**
 * Delete a user by id. Used to clean up the orphan user when Tenant provisioning
 * fails after sign-up (Story 1.3, AC-3 — leave no account in a half-created state).
 * Lives in the auth infra layer (ESLint-exempt) so the Server Action never touches
 * the raw db directly.
 *
 * NOTE: `user` is a global, no-RLS table (queried before any tenant context), so this
 * runs as the connection role. Callers MUST pass only the id of a user they just
 * created (the FK `tenants.owner_user_id` is ON DELETE CASCADE — deleting an
 * already-provisioned owner would cascade-drop their Tenant).
 */
export async function deleteUserById(id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id));
}

/** True if a user row with this id exists. Used to detect Better Auth's synthetic
 * (non-persisted) user returned for a duplicate email under requireEmailVerification. */
export async function userExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  return row !== undefined;
}

/** True if a user with this email already exists (Story 2.4 — the accept flow's
 * existing-email guard; v1 ships the new-Client path, linking is a fast-follow). Email is
 * stored lowercased by Better Auth; callers pass the normalized invitation email. */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return row !== undefined;
}
