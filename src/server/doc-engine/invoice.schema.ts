import { z } from "zod";
import { computeAmountTotal } from "./money";

// A safe ceiling under PG `integer` (2,147,483,647) for the stored minor-unit total — guards the
// INSERT from an int4-overflow crash (a legit huge invoice gets a clear message, not "try again").
const MAX_AMOUNT_MINOR = 2_000_000_000;

/** A line item at the action boundary — `unitAmount` is integer MINOR units (the UI converts
 * major→minor before submit); `quantity` may be fractional (e.g. 2.5 hours). Per-field caps keep a
 * single value alone from overflowing int4; the total refine below catches the aggregate. */
export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Add a description.").max(500),
  quantity: z.number().positive("Quantity must be positive.").finite().max(1_000_000),
  unitAmount: z.number().int("Amounts must be whole minor units.").min(0).max(MAX_AMOUNT_MINOR),
});

/** Create-invoice input (Story 5.1). Money arrives as integer minor units; the server recomputes
 * the total — a client-sent total is never trusted (so there is no `amountTotal` field here). The
 * `currency` is a real 3-LETTER code (not just length-3) so it can never crash `Intl.NumberFormat`
 * at render time; the total is bounded so a large invoice fails with a clear message, not an int4 crash. */
export const createInvoiceSchema = z
  .object({
    engagementId: z.uuid(),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item.").max(100),
    currency: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{3}$/, "Use a 3-letter currency code.")
      .transform((s) => s.toUpperCase()),
    issuedAt: z.coerce.date().optional(),
    dueAt: z.coerce.date().nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => computeAmountTotal(v.lineItems) <= MAX_AMOUNT_MINOR, {
    message: "This invoice total is too large to record.",
    path: ["lineItems"],
  });

export type CreateInvoiceData = z.infer<typeof createInvoiceSchema>;
/** A line item as stored/created — `unitAmount` is integer minor units. */
export type InvoiceLineItem = z.infer<typeof lineItemSchema>;

/** Send / mark-paid input (Story 5.2). `engagementId` is the URL-tamper cross-check (the action
 * verifies `invoice.engagementId === engagementId` after the RLS-scoped read) AND the revalidate
 * target. Both status actions share this shape — the transition itself is a guarded UPDATE. */
export const invoiceActionSchema = z.object({
  invoiceId: z.uuid(),
  engagementId: z.uuid(),
});

export type InvoiceActionData = z.infer<typeof invoiceActionSchema>;
