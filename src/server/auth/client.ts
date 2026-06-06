"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client (`better-auth/react`, hooks/stores). The "use client" directive
 * makes a stray Server Component import fail loudly at build instead of at runtime.
 * No db/server-auth import here.
 */
export const authClient = createAuthClient();

export const { signUp, signIn, signOut, useSession } = authClient;
