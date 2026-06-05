"use server";

import {
  signUpFreelancer as run,
  type SignUpFreelancerInput,
  type SignUpResult,
} from "@/server/auth/sign-up";

/** Server Action: thin wrapper over the auth-layer orchestration (which owns the
 * sanctioned db/auth access behind the NFR-2 choke point). */
export async function signUpFreelancer(input: SignUpFreelancerInput): Promise<SignUpResult> {
  return run(input);
}
