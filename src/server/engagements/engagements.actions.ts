"use server";

import { revalidatePath } from "next/cache";
import { requireFreelancer } from "@/server/auth/session";
import {
  archiveEngagement,
  createEngagement,
  updateEngagement,
} from "@/server/db/repositories/engagements.repository";
import { createEngagementSchema, updateEngagementSchema } from "./engagements.schema";

const LIST_PATH = "/app"; // the Engagements list IS the Cockpit home (Story 2.1, Task 5)

export type CreateEngagementResult = { ok: true; id: string } | { ok: false; error: string };
export type MutateEngagementResult = { ok: true } | { ok: false; error: string };

/** Create an Engagement for the signed-in Freelancer's Tenant (AC-1). */
export async function createEngagementAction(input: {
  name: string;
  clientDisplayName: string;
  scope?: string;
}): Promise<CreateEngagementResult> {
  const ctx = await requireFreelancer();

  const parsed = createEngagementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  try {
    const e = await createEngagement(ctx, parsed.data);
    revalidatePath(LIST_PATH);
    return { ok: true, id: e.id };
  } catch (err) {
    console.error("[engagements] createEngagementAction failed:", err);
    return { ok: false, error: "Couldn't create the engagement. Please try again." };
  }
}

/** Edit an Engagement's details or status (AC-2/AC-3). */
export async function updateEngagementAction(
  id: string,
  input: { name?: string; clientDisplayName?: string; scope?: string; status?: string },
): Promise<MutateEngagementResult> {
  const ctx = await requireFreelancer();

  const parsed = updateEngagementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  try {
    const row = await updateEngagement(ctx, id, parsed.data);
    if (!row) return { ok: false, error: "That engagement no longer exists." };
    revalidatePath(LIST_PATH);
    revalidatePath(`/app/engagements/${id}/edit`);
    return { ok: true };
  } catch (err) {
    console.error("[engagements] updateEngagementAction failed:", err);
    return { ok: false, error: "Couldn't save your changes. Please try again." };
  }
}

/** Soft-archive an Engagement (AC-3) — hidden from the active list, history kept. */
export async function archiveEngagementAction(id: string): Promise<MutateEngagementResult> {
  const ctx = await requireFreelancer();

  try {
    const row = await archiveEngagement(ctx, id);
    if (!row) return { ok: false, error: "That engagement no longer exists." };
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (err) {
    console.error("[engagements] archiveEngagementAction failed:", err);
    return { ok: false, error: "Couldn't archive the engagement. Please try again." };
  }
}
