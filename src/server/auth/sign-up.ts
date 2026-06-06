import { headers } from "next/headers";
import { z } from "zod";
import { validateSlug } from "@/lib/slug";
import {
  AlreadyProvisionedError,
  SlugTakenError,
  provisionTenant,
} from "@/server/db/repositories/tenants.repository";
import { auth } from "./index";
import { deleteUserById, userExists } from "./users";

export type SignUpField = "name" | "email" | "password" | "slug" | "form";
export type SignUpFreelancerInput = {
  name: string;
  email: string;
  password: string;
  slug: string;
};
export type SignUpResult =
  | { ok: true }
  | { ok: false; fieldErrors: Partial<Record<SignUpField, string>> };

const InputSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
  // Slug is format/reserved-checked by validateSlug below (better messages).
  slug: z.string(),
});

const GENERIC_FORM_ERROR =
  "Something went wrong. Please try again in a moment.";

/**
 * Freelancer sign-up + Tenant provisioning (Story 1.3). Orchestration lives in the
 * auth infra layer (not the Server Action file) so it can use the sanctioned db/auth
 * helpers behind the NFR-2 choke point.
 *
 * Order: validate → validateSlug (fast reject, no DB) → Better Auth signUpEmail
 * (user, hashed password, sends verification email) → provisionTenant.
 *
 * Anti-enumeration: with `requireEmailVerification`, Better Auth returns a GENERIC
 * success carrying a SYNTHETIC, non-persisted user when the email already exists (it
 * does NOT throw — see sign-up route). We must not leak that: detect the synthetic
 * user (it isn't in the DB) and return the same "check your email" success without
 * provisioning. On a slug/owner collision after a REAL user is created, delete the
 * orphan user so no usable account is left (AC-3).
 */
export async function signUpFreelancer(
  input: SignUpFreelancerInput,
): Promise<SignUpResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<SignUpField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = typeof issue.path[0] === "string" ? (issue.path[0] as SignUpField) : "form";
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const { name, email, password } = parsed.data;

  const slug = validateSlug(parsed.data.slug);
  if (!slug.ok) {
    return {
      ok: false,
      fieldErrors: {
        slug:
          slug.reason === "reserved"
            ? "That workspace name is reserved — pick another."
            : "Use 3–63 lowercase letters, numbers, and single hyphens.",
      },
    };
  }

  // Create the user (Better Auth hashes the password, sends the verification email).
  // Pass request headers so origin checks + rate limiting + cookie handling apply.
  let userId: string;
  try {
    const res = await auth.api.signUpEmail({
      // callbackURL is where the email-verification link lands after confirming +
      // auto-sign-in — send the freelancer straight to their Cockpit, not the landing.
      body: { name, email, password, callbackURL: "/app" },
      headers: await headers(),
    });
    userId = res.user.id;
  } catch (err) {
    // We pre-validate email/password, so a throw here is an unexpected failure
    // (infra, rate limit, policy) — not "email already in use" (that path returns
    // a generic success, handled below). Log it; show a neutral message.
    console.error("[sign-up] signUpEmail failed:", err);
    return { ok: false, fieldErrors: { form: GENERIC_FORM_ERROR } };
  }

  // Anti-enumeration: a duplicate email yields a synthetic (non-persisted) user. If the
  // user wasn't actually created, return the SAME generic success without provisioning.
  if (!(await userExists(userId))) {
    return { ok: true };
  }

  // Provision the Tenant. On a collision the (real) user already exists → clean it up.
  try {
    await provisionTenant({ ownerUserId: userId, slug: slug.slug, name });
  } catch (err) {
    await deleteUserById(userId);
    if (err instanceof SlugTakenError) {
      return { ok: false, fieldErrors: { slug: "That workspace name is already taken." } };
    }
    if (err instanceof AlreadyProvisionedError) {
      return { ok: false, fieldErrors: { form: "This account already has a workspace." } };
    }
    // Unknown failure: don't rethrow (it would crash the Server Action / client).
    console.error("[sign-up] provisionTenant failed:", err);
    return { ok: false, fieldErrors: { form: GENERIC_FORM_ERROR } };
  }

  return { ok: true };
}
