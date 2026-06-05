import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. No baseURL → uses the current origin (single domain).
 * No db import here, so this is safe to use from client components.
 */
export const authClient = createAuthClient();

export const { signUp, signIn, signOut, useSession } = authClient;
